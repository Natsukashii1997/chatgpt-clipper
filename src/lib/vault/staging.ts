// 整段收藏（FR-13）的写入，分四步，和消息 thread-begin / thread-file / thread-end / thread-cancel 一一对应：
// beginThread 定下并预留收藏文件夹、开一个暂存任务 → stageThreadFile 长图一张张先放进本机暂存 →
// endThread 核对清单后整组写进 Vault；cancelThread 丢掉暂存。暂存在插件数据库里，后台中途被终止也不丢。
import { hasFolder, newFolder, type VaultFile } from './fs.ts';
import { commit, getSaved, serial } from './journal.ts';
import { idb, THREAD_FOLDER, THREAD_JOB } from './store.ts';

/** 整段收藏（FR-13）开头：定下写到哪个文件夹并建好。id 是对话地址：收藏过且原文件夹还在就沿用（覆盖）；
 *  原文件夹被整理走了返回 moved、不写；没收藏过就新建，重名加序号 */
interface ThreadFolder { dir: FileSystemDirectoryHandle; target?: FileSystemDirectoryHandle; name: string; job?: string }
interface ThreadJob { dir: FileSystemDirectoryHandle; target?: FileSystemDirectoryHandle; id: string; name: string; touched: number; files: VaultFile[] }
export function beginThread(dir: FileSystemDirectoryHandle, id: string, folder: string) {
  return serial(async (): Promise<{ name: string; job?: string; updated?: boolean; moved?: boolean }> => {
    await reapThreadJobs();
    const prev = await getSaved(id);
    if (prev && !(await hasFolder(dir, prev.folder))) return { name: prev.folder, moved: true };
    const reserved = await idb<ThreadFolder | undefined>('readonly', s => s.get(THREAD_FOLDER + id));
    const reuse = reserved && await dir.isSameEntry(reserved.dir) && await sameFolder(dir, reserved.name, reserved.target);
    const name = prev?.folder ?? (reuse ? reserved.name : await newFolder(dir, folder));
    const target = await dir.getDirectoryHandle(name, { create: true });
    const job = crypto.randomUUID();
    await idb('readwrite', s => {
      s.put({ dir, name, target, job }, THREAD_FOLDER + id);
      return s.put({ dir, target, id, name, touched: Date.now(), files: [] } satisfies ThreadJob, THREAD_JOB + job);
    });
    return { name, job, updated: !!prev };
  });
}

/** 分批消息只写本次任务的本机暂存；结束前不覆盖 Vault 里的旧图。 */
export function stageThreadFile(dir: FileSystemDirectoryHandle, job: string, file: VaultFile) {
  return serial(async () => {
    const staged = await idb<ThreadJob | undefined>('readonly', s => s.get(THREAD_JOB + job));
    if (!staged || !(await dir.isSameEntry(staged.dir))) throw new Error('整段收藏任务已失效，请重新收藏');
    try {
      if (expired(staged)) throw new Error('整段收藏任务已过期，请重新收藏');
      staged.files = [...staged.files.filter(f => f.name !== file.name), file];
      staged.touched = Date.now();
      await idb('readwrite', s => s.put(staged, THREAD_JOB + job));
    } catch (e) {
      await dropThreadJob(job).catch(() => undefined);
      throw e;
    }
  });
}

/** 整段收藏结尾：核对本次清单，再整组提交笔记、图片和旧图清理；失败恢复旧版本。 */
export function endThread(dir: FileSystemDirectoryHandle, id: string, name: string, note: VaultFile, images: string[], job: string) {
  return serial(async () => {
    const staged = await idb<ThreadJob | undefined>('readonly', s => s.get(THREAD_JOB + job));
    if (!staged || expired(staged) || staged.id !== id || staged.name !== name || !(await dir.isSameEntry(staged.dir)))
      throw new Error('整段收藏任务已失效，请重新收藏');
    if (images.length !== staged.files.length || new Set(images).size !== images.length || images.some(f => !staged.files.some(s => s.name === f)))
      throw new Error('整段收藏的长图没有收齐，请重新收藏');
    const prev = await getSaved(id);
    if (!(await sameFolder(dir, name, staged.target))) throw new Error('原收藏文件夹已被整理走或替换，这次没有重写');
    const sub = await dir.getDirectoryHandle(name), stale: string[] = [];
    for await (const [f, h] of sub.entries())
      if (h.kind === 'file' && ((THREAD_IMAGE.test(f) && !images.includes(f)) || (f === prev?.note && f !== note.name))) stale.push(f);
    try {
      await commit(dir, id, name, [note, ...staged.files], stale);
    } finally {
      await dropThreadJob(job).catch(() => undefined);
    }
  });
}

// 任务租期随传图续期。worker / 页面中断无法通知时，在下次收藏时回收超过一天的暂存。
// 未带时间的旧版本任务也不能无限保留；近期并发任务不清理。文件夹本身不删除，避免误删用户文件。
const THREAD_TTL = 24 * 60 * 60 * 1000;
const expired = (job: ThreadJob) => !Number.isFinite(job.touched) || Date.now() - job.touched >= THREAD_TTL;
async function dropThreadJob(job: string) {
  const staged = await idb<ThreadJob | undefined>('readonly', s => s.get(THREAD_JOB + job));
  if (!staged) return;
  const reserved = await idb<ThreadFolder | undefined>('readonly', s => s.get(THREAD_FOLDER + staged.id));
  await idb('readwrite', s => {
    if (reserved?.job === job) s.delete(THREAD_FOLDER + staged.id);
    return s.delete(THREAD_JOB + job);
  });
}

/** 取消只处理本机暂存，不依赖 Vault 授权和故障恢复成功，不影响其他任务。 */
export function cancelThread(job: string) {
  return serial(() => dropThreadJob(job), false);
}

/** 回收超过一天没动的暂存任务（每次收藏前顺带做） */
export async function reapThreadJobs() {
  const keys = await idb<IDBValidKey[]>('readonly', s => s.getAllKeys());
  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(THREAD_JOB)) continue;
    const job = await idb<ThreadJob | undefined>('readonly', s => s.get(key));
    if (job && expired(job)) await dropThreadJob(key.slice(THREAD_JOB.length));
  }
}

/** 目录名可被删除后重用；持久句柄才代表预留时的那一个目录。旧版本缺句柄的预留不复用。 */
async function sameFolder(dir: FileSystemDirectoryHandle, name: string, target?: FileSystemDirectoryHandle) {
  if (!target) return false;
  try { return await target.isSameEntry(await dir.getDirectoryHandle(name)); }
  catch (e) { if (['NotFoundError', 'TypeMismatchError'].includes((e as DOMException).name)) return false; throw e; }
}

/** 整段收藏的长图：answer-01.png、answer-02.png…… */
export const THREAD_IMAGE = /^answer-\d+\.png$/;
