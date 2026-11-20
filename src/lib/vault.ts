// Vault 目标文件夹：设置页（扩展自己的页面）选一次，目录句柄存 IndexedDB；后台取出来直接写。
// 授权跟着扩展的来源走，不属于 chatgpt.com；后台不能弹授权窗口，授权失效时由设置页重新授权。


// TypeScript 自带的 DOM 类型还没有这几个 File System Access 接口
declare global {
  interface FileSystemHandle {
    queryPermission(d?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(d?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }
  interface Window {
    showDirectoryPicker(o?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
}

const DB = 'chatgpt-clipper', STORE = 'kv', KEY = 'vaultDir';

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(STORE, mode);
      let req: IDBRequest;
      tx.oncomplete = () => { db.close(); resolve(req.result as T); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('收藏索引没有提交')); };
      try { req = run(tx.objectStore(STORE)); }
      catch (e) { tx.abort(); db.close(); reject(e); }
    };
  });
}

export const loadDir = () => idb<FileSystemDirectoryHandle | undefined>('readonly', s => s.get(KEY));

// 收藏文件夹在 Obsidian 里的位置「Vault 名/在 Vault 里的路径」：浏览器不给完整路径，由用户在设置页填一次，
// 用来生成在 Obsidian 里打开笔记的链接（2026-11-04 用户选定：点进度卡绿块打开，A 版）
const WHERE = 'obsidianPath';
export const loadWhere = async () => (await idb<string | undefined>('readonly', s => s.get(WHERE))) ?? '';
export const saveWhere = (v: string) => idb('readwrite', s => s.put(v.trim(), WHERE));

/** obsidian://open 链接：vault 用名字，file 是从 Vault 根开始的路径（.md 可省） */
export function obsidianUrl(where: string, folder: string, note: string): string {
  const [vault = '', ...rest] = where.split('/').map(s => s.trim()).filter(Boolean);
  const file = [...rest, folder, note.replace(/\.md$/, '')].join('/');
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
}

/** 换成另一个文件夹时清掉「已收藏」清单（清单里的文件夹名只对原文件夹有效）；重选同一个文件夹不清 */
export async function saveDir(h: FileSystemDirectoryHandle) {
  const old = await loadDir();
  if (old && !(await old.isSameEntry(h))) await idb('readwrite', s => s.delete(IDBKeyRange.bound(SAVED, `${SAVED}\uffff`)));
  await idb('readwrite', s => s.put(h, KEY));
}

// 「已收藏」清单：回答指纹 → 收藏文件夹名、笔记文件名。不存正文。早期只存了文件夹名（字符串）
const SAVED = 'saved:';
export interface Saved { folder: string; note?: string }
export const getSaved = async (id: string): Promise<Saved | undefined> => {
  const v = await idb<string | Saved | undefined>('readonly', s => s.get(SAVED + id));
  return typeof v === 'string' ? { folder: v } : v;
};

// 所有标签页共用后台的队列，保护「查目录 → 分配名字 → 写入 → 记索引」；失败不堵住下一次收藏。
let writing: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>, restore = true): Promise<T> {
  const next = writing.then(async () => { if (restore) await recover(); return run(); });
  writing = next.catch(() => undefined);
  return next;
}

// File System Access 不能原子替换整组文件。先持久保存改前副本，再写文件，最后在同一个 IDB 事务里
// 提交索引和完成标记。后台被终止或恢复失败时保留日志，下一次写入前先恢复；不把半组文件当成功。
const PENDING = 'pending-write';
interface Pending {
  dir: FileSystemDirectoryHandle;
  name: string;
  existed: boolean;
  before: { name: string; data?: Blob }[];
  oldFolder?: string;
  committed?: boolean;
}

async function recover() {
  const p = await idb<Pending | undefined>('readonly', s => s.get(PENDING));
  if (!p) return;
  if (p.committed) {
    if (p.oldFolder && await hasFolder(p.dir, p.oldFolder)) await p.dir.removeEntry(p.oldFolder, { recursive: true });
  } else if (!p.existed) {
    if (await hasFolder(p.dir, p.name)) await p.dir.removeEntry(p.name, { recursive: true });
  } else {
    const sub = await p.dir.getDirectoryHandle(p.name);
    for (const f of p.before) {
      if (f.data) await writeFiles(p.dir, p.name, [{ name: f.name, data: f.data }]);
      else await removeFile(sub, f.name);
    }
  }
  await idb('readwrite', s => s.delete(PENDING));
}

async function removeFile(sub: FileSystemDirectoryHandle, name: string) {
  try { await sub.removeEntry(name); }
  catch (e) { if ((e as DOMException).name !== 'NotFoundError') throw e; }
}

async function commit(dir: FileSystemDirectoryHandle, id: string, name: string, files: VaultFile[], stale: string[] = [], oldFolder?: string) {
  const existed = await hasFolder(dir, name), before: Pending['before'] = [];
  const sub = existed ? await dir.getDirectoryHandle(name) : undefined;
  for (const f of new Set([...files.map(f => f.name), ...stale])) {
    let data: Blob | undefined;
    if (sub) {
      try {
        const file = await (await sub.getFileHandle(f)).getFile();
        // getFile() 是磁盘快照，原文件改变后可能失效；先独立复制字节，再开始覆盖。
        data = new Blob([await file.arrayBuffer()], { type: file.type });
      } catch (e) { if ((e as DOMException).name !== 'NotFoundError') throw e; }
    }
    before.push({ name: f, data });
  }
  const p: Pending = { dir, name, existed, before, oldFolder };
  await idb('readwrite', s => s.put(p, PENDING));
  try {
    await writeFiles(dir, name, files);
    const target = await dir.getDirectoryHandle(name);
    for (const f of stale) await removeFile(target, f);
    await idb('readwrite', s => {
      s.put({ folder: name, note: files.find(f => f.name.endsWith('.md'))?.name }, SAVED + id);
      return s.put({ ...p, committed: true }, PENDING);
    });
  } catch (e) {
    try { await recover(); }
    catch (recovery) { throw new Error(`写入失败，旧收藏尚未恢复；下次保存前会重试恢复：${String(recovery)}`, { cause: e }); }
    throw e;
  }
  // 索引已提交，新收藏完整可用；旧目录清理失败则保留日志，下次写入前再清理。
  await recover().catch(() => undefined);
}

/** 写一条收藏（FR-5）。新回答：新建文件夹，重名加序号。同一条回答：覆盖原文件夹；文件夹名里的标题和现在应有的不一样
 *  （命名规则调整、标题变了），且里面只有插件写的长图和一篇笔记，就改成新名字（日期沿用第一次收藏的）；原文件夹被整理走了就不写 */
export function saveCollection(dir: FileSystemDirectoryHandle, id: string, folder: string, files: VaultFile[]) {
  return serial(async () => { await reapThreadJobs(); return saveOne(dir, id, folder, files); });
}

async function saveOne(dir: FileSystemDirectoryHandle, id: string, folder: string, files: VaultFile[]):
  Promise<{ name: string; updated?: boolean; moved?: boolean }> {
  const prev = await getSaved(id), md = files.find(f => f.name.endsWith('.md')), note = md?.name;
  if (prev && !(await hasFolder(dir, prev.folder))) return { name: prev.folder, moved: true };
  // 已有收藏只接受完整更新；生成失败的部分结果交给调用方原有的失败提示和下载兜底。
  if (prev && (!md || !files.some(f => f.name === 'answer.png')))
    throw new Error('本次长图或笔记没有生成完整，旧收藏未更新');
  let name = prev?.folder ?? await newFolder(dir, folder);
  if (prev && titlePart(prev.folder) !== titlePart(folder) && await onlyOurs(await dir.getDirectoryHandle(prev.folder), prev.note))
    name = await newFolder(dir, `${prev.folder.match(DATE)?.[0] ?? ''} ${titlePart(folder)}`.trim());
  const stale = prev?.note && note && prev.note !== note && name === prev.folder ? [prev.note] : [];
  await commit(dir, id, name, files, stale, prev && name !== prev.folder ? prev.folder : undefined);
  return { name, updated: !!prev };
}

/** 整段收藏（FR-13）开头：定下写到哪个文件夹并建好。id 是对话地址：收藏过且原文件夹还在就沿用（覆盖）；
 *  原文件夹被整理走了返回 moved、不写；没收藏过就新建，重名加序号 */
const THREAD_JOB = 'thread-job:', THREAD_FOLDER = 'thread-folder:';
interface ThreadFolder { dir: FileSystemDirectoryHandle; target?: FileSystemDirectoryHandle; name: string; job?: string }
interface ThreadJob { dir: FileSystemDirectoryHandle; target?: FileSystemDirectoryHandle; id: string; name: string; touched: number; files: VaultFile[] }
export function threadFolder(dir: FileSystemDirectoryHandle, id: string, folder: string) {
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
export function writeThreadFile(dir: FileSystemDirectoryHandle, job: string, file: VaultFile) {
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
export function finishThread(dir: FileSystemDirectoryHandle, id: string, name: string, note: VaultFile, images: string[], job: string) {
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

async function reapThreadJobs() {
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

const DATE = /^\d{4}-\d{2}-\d{2}/;
/** 文件夹名里的标题部分：去掉开头的日期和结尾的序号 */
const titlePart = (f: string) => f.replace(DATE, '').replace(/ \(\d+\)$/, '').trim();

/** 文件夹里只有插件写的东西（answer.png + 一篇笔记）才能整体改名，免得动到用户自己放进去的文件 */
async function onlyOurs(sub: FileSystemDirectoryHandle, note?: string): Promise<boolean> {
  let notes = 0;
  for await (const [name, h] of sub.entries()) {
    if (h.kind !== 'file') return false;
    if (name === 'answer.png') continue;
    if (name.endsWith('.md') && (!note || name === note) && ++notes === 1) continue;
    return false;
  }
  return true;
}

export type DirState = 'none' | 'stuck' | PermissionState;
export async function dirState(dir?: FileSystemDirectoryHandle): Promise<DirState> {
  return dir ? dir.queryPermission({ mode: 'readwrite' }) : 'none';
}

/** 取出设置页存的文件夹并查授权。真实 Chrome 里这两步一直不回过（2026-11-20：入库一直转圈、设置页停在「未选择」，原因未查清），
 *  限时 5 秒，到时算 'stuck'，由调用方写明并让用户重新选文件夹。测试里可以用 self.__dirLimit 改小 */
export async function findDir(): Promise<{ dir?: FileSystemDirectoryHandle; state: DirState; waited: number }> {
  const ms = (globalThis as { __dirLimit?: number }).__dirLimit ?? 5_000;
  let dir: FileSystemDirectoryHandle | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const state = await Promise.race([
    (async () => dirState(dir = await loadDir()))(),
    new Promise<'stuck'>(r => { timer = setTimeout(() => r('stuck'), ms); }),
  ]);
  clearTimeout(timer);
  return { dir, state, waited: ms };
}

export interface VaultFile { name: string; data: Blob | string }

/** 给一条新收藏起文件夹名：重名（另一条回答碰巧同名）时加「 (2)」「 (3)」 */
export async function newFolder(dir: FileSystemDirectoryHandle, base: string): Promise<string> {
  let name = base;
  for (let n = 2; await hasFolder(dir, name); n++) name = `${base} (${n})`;
  return name;
}

/** 把文件写进 dir/name/，没有就建；同名文件整个覆盖 */
export async function writeFiles(dir: FileSystemDirectoryHandle, name: string, files: VaultFile[]) {
  const sub = await dir.getDirectoryHandle(name, { create: true });
  for (const f of files) {
    const w = await (await sub.getFileHandle(f.name, { create: true })).createWritable();
    try {
      await w.write(f.data);
      await w.close();
    } catch (e) {
      await w.abort().catch(() => undefined);
      throw e;
    }
  }
}

export async function hasFolder(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getDirectoryHandle(name);
    return true;
  } catch (e) {
    if ((e as DOMException).name === 'NotFoundError') return false;
    if ((e as DOMException).name === 'TypeMismatchError') return true;   // 同名的是文件
    throw e;
  }
}
