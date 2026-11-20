// Vault 目标文件夹：设置页（扩展自己的页面）选一次，目录句柄存 IndexedDB；后台取出来直接写。
// 授权跟着扩展的来源走，不属于 chatgpt.com；后台不能弹授权窗口，授权失效时由设置页重新授权。
import { limit, Stuck, within } from '../timeout.ts';
import { hasFolder } from './fs.ts';
import { idb, KEY, SAVED, WHERE } from './store.ts';

export const loadDir = (ms?: number) => idb<FileSystemDirectoryHandle | undefined>('readonly', s => s.get(KEY), ms);

// 收藏文件夹在 Obsidian 里的位置「Vault 名/在 Vault 里的路径」：浏览器不给完整路径，由用户在设置页填一次，
// 用来生成在 Obsidian 里打开笔记的链接（2026-11-04 用户选定：点进度卡绿块打开，A 版）
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
  // 原来存着的读不出、比不了时（Stuck），按「没换文件夹」处理、照样存新的：重新选文件夹正是读不出时的出路，不能被它卡住（L-26）。
  // 代价：这时如果真换了文件夹，清单没清，旧文件夹里收藏过的回答在新文件夹会显示「已收藏过」
  let changed = false;
  try {
    const old = await loadDir(DIR_LIMIT);
    changed = !!old && !(await within('比对原来的文件夹', DIR_LIMIT, old.isSameEntry(h)));
  } catch (e) { if (!(e instanceof Stuck)) throw e; }
  if (changed) await idb('readwrite', s => s.delete(IDBKeyRange.bound(SAVED, `${SAVED}\uffff`)));
  await idb('readwrite', s => s.put(h, KEY));
}
const DIR_LIMIT = 3_000;

export type DirState = 'none' | 'stuck' | PermissionState;

// 查授权（queryPermission）在常浩的 Chrome 158 里一直不回（2026-11-20 自检实测：数据库读写、取文件夹都正常，只有这一步卡，L-26）。
// 卡过一次就记住，这个后台或页面活着期间不再问，直接试读
let permStuck = false;
/** 试读用的子文件夹名：不存在，只查不写 */
export const PROBE = '.clipper-自检-不存在';

/** 查授权不回时的替代：直接读一下文件夹（查一个不存在的子文件夹，不写任何东西）。读得通按有授权往下走，
 *  真写不进时写入那一步会报错、退回下载；浏览器明确拒绝算授权失效；也不回才算卡住 */
async function probeDir(dir: FileSystemDirectoryHandle, ms: number): Promise<DirState> {
  try {
    await within('读文件夹', ms, hasFolder(dir, PROBE));
    return 'granted';
  } catch (e) {
    if (e instanceof Stuck) return 'stuck';
    if (['NotAllowedError', 'SecurityError'].includes((e as DOMException).name)) return 'prompt';
    throw e;
  }
}

/** 取出设置页存的文件夹并查授权。真实 Chrome 里这一段一直不回过（2026-11-20：入库一直转圈、设置页停在「未选择」），
 *  取文件夹、查授权合计限时 5 秒（取文件夹卡住时 dir 为空，并中止那次读）；查授权不回就改成试读文件夹（再限时 3 秒），
 *  都不回才算 'stuck'，由调用方写明并让用户重新选文件夹 */
export async function findDir(): Promise<{ dir?: FileSystemDirectoryHandle; state: DirState; waited: number }> {
  const ms = limit('dir'), t0 = performance.now();
  try {
    const dir = await loadDir(ms);
    if (!dir) return { state: 'none', waited: ms };
    const probe = Math.min(ms, 3_000);
    if (permStuck) return { dir, state: await probeDir(dir, probe), waited: probe };
    try {
      // 查授权平常几毫秒就回，最多等 2 秒
      const left = Math.max(1, Math.min(2_000, ms - (performance.now() - t0)));
      return { dir, state: await within('查授权', left, dir.queryPermission({ mode: 'readwrite' })), waited: ms };
    } catch (e) {
      if (!(e instanceof Stuck)) throw e;
      permStuck = true;
      return { dir, state: await probeDir(dir, probe), waited: ms };
    }
  } catch (e) {
    if (!(e instanceof Stuck)) throw e;
    return { state: 'stuck', waited: ms };
  }
}
