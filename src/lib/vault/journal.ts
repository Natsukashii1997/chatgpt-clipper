// 写一组文件进 Vault 的底座：已收藏清单、写入队列、写入日志与恢复、整组提交。单条收藏（save.ts）和整段收藏（staging.ts）都经这里写。
import { limit, Stuck, within } from '../timeout.ts';
import { hasFolder, removeFile, writeFiles, type VaultFile } from './fs.ts';
import { idb, PENDING, SAVED } from './store.ts';

// 「已收藏」清单：回答指纹 → 收藏文件夹名、笔记文件名。不存正文。早期只存了文件夹名（字符串）
export interface Saved { folder: string; note?: string }
export const getSaved = async (id: string): Promise<Saved | undefined> => {
  const v = await idb<string | Saved | undefined>('readonly', s => s.get(SAVED + id));
  return typeof v === 'string' ? { folder: v } : v;
};

// 所有标签页共用后台的队列，保护「查目录 → 分配名字 → 写入 → 记索引」；失败不堵住下一次收藏。
let writing: Promise<unknown> = Promise.resolve();
// 恢复也限时（见 recover）：它不结束的话，排在后面的收藏全都跟着卡
export function serial<T>(run: () => Promise<T>, restore = true): Promise<T> {
  const next = writing.then(async () => { if (restore) await recover(); return run(); });
  writing = next.catch(() => undefined);
  return next;
}

// File System Access 不能原子替换整组文件。先持久保存改前副本，再写文件，最后在同一个 IDB 事务里
// 提交索引和完成标记。后台被终止或恢复失败时保留日志，下一次写入前先恢复；不把半组文件当成功。
interface Pending {
  dir: FileSystemDirectoryHandle;
  name: string;
  existed: boolean;
  before: { name: string; data?: Blob }[];
  oldFolder?: string;
  committed?: boolean;
}

/** 恢复上次没写完的收藏。整个过程限时：日志里存的文件夹句柄可能已经失效、读写它一直不回（L-26 那种），
 *  到时抛 Stuck、日志留着，这次收藏按失败退回下载，不让写入队列一直卡住 */
function recover(): Promise<void> {
  return within('恢复上次没写完的收藏时，文件夹', limit('recover'), replay()).catch((e: unknown) => {
    throw e instanceof Stuck ? new Stuck(`${e.message}，这次没写进 Vault；去设置页点「自检」看卡在哪一步`) : e;
  });
}

async function replay() {
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

export async function commit(dir: FileSystemDirectoryHandle, id: string, name: string, files: VaultFile[], stale: string[] = [], oldFolder?: string) {
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
