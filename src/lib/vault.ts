// Vault 目标文件夹：设置页（扩展自己的页面）选一次，目录句柄存 IndexedDB；后台取出来直接写。
// 授权跟着扩展的来源走，不属于 chatgpt.com；后台不能弹授权窗口，授权失效时由设置页重新授权。

import { readWhy, withWhy } from './why.ts';

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
      const db = open.result, req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => { db.close(); resolve(req.result as T); };
      req.onerror = () => { db.close(); reject(req.error); };
    };
  });
}

export const loadDir = () => idb<FileSystemDirectoryHandle | undefined>('readonly', s => s.get(KEY));

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
const setSaved = (id: string, v: Saved) => idb('readwrite', s => s.put(v, SAVED + id));

/** 写一条收藏（FR-5）。新回答：新建文件夹，重名加序号。同一条回答：覆盖原文件夹；文件夹名里的标题和现在应有的不一样
 *  （命名规则调整、标题变了），且里面只有插件写的长图和一篇笔记，就改成新名字（日期沿用第一次收藏的）；原文件夹被整理走了就不写 */
export async function saveCollection(dir: FileSystemDirectoryHandle, id: string, folder: string, files: VaultFile[]):
  Promise<{ name: string; updated?: boolean; moved?: boolean; why?: string }> {
  const prev = await getSaved(id), md = files.find(f => f.name.endsWith('.md')), note = md?.name;
  if (prev && !(await hasFolder(dir, prev.folder))) return { name: prev.folder, moved: true };
  // 再收藏时沿用旧笔记里写的「为什么存」（可能在 Obsidian 里改过）
  const why = prev?.note ? readWhy(await readNote(dir, prev.folder, prev.note).catch(() => '')) : '';
  if (md && why) md.data = withWhy(await text(md.data), why);
  let name = prev?.folder ?? await newFolder(dir, folder);
  if (prev && titlePart(prev.folder) !== titlePart(folder) && await onlyOurs(await dir.getDirectoryHandle(prev.folder), prev.note))
    name = await newFolder(dir, `${prev.folder.match(DATE)?.[0] ?? ''} ${titlePart(folder)}`.trim());
  await writeFiles(dir, name, files);
  if (prev && name !== prev.folder) await dir.removeEntry(prev.folder, { recursive: true });
  else if (prev?.note && note && prev.note !== note) await (await dir.getDirectoryHandle(name)).removeEntry(prev.note).catch(() => undefined);
  await setSaved(id, { folder: name, note });
  return { name, updated: !!prev, why };
}

/** 收藏后补写「为什么存」：只改这条收藏的笔记，长图不动 */
export async function saveWhy(dir: FileSystemDirectoryHandle, id: string, why: string) {
  const prev = await getSaved(id);
  if (!prev?.note || !(await hasFolder(dir, prev.folder))) throw new Error('笔记找不到了，可能被整理走了');
  await writeFiles(dir, prev.folder, [{ name: prev.note, data: withWhy(await readNote(dir, prev.folder, prev.note), why) }]);
}

async function readNote(dir: FileSystemDirectoryHandle, folder: string, note: string): Promise<string> {
  return (await (await (await dir.getDirectoryHandle(folder)).getFileHandle(note)).getFile()).text();
}

const text = (d: Blob | string) => (typeof d === 'string' ? Promise.resolve(d) : d.text());

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

export type DirState = 'none' | PermissionState;
export async function dirState(dir?: FileSystemDirectoryHandle): Promise<DirState> {
  return dir ? dir.queryPermission({ mode: 'readwrite' }) : 'none';
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
    await w.write(f.data);
    await w.close();
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
