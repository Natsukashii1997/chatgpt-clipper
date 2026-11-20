// 往 Vault 文件夹里读写的小工具（File System Access API）。
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

export async function removeFile(sub: FileSystemDirectoryHandle, name: string) {
  try { await sub.removeEntry(name); }
  catch (e) { if ((e as DOMException).name !== 'NotFoundError') throw e; }
}
