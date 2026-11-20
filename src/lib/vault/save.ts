// 单条收藏、节选的写入（FR-5）。
import { hasFolder, newFolder, type VaultFile } from './fs.ts';
import { commit, getSaved, serial } from './journal.ts';
import { reapThreadJobs } from './staging.ts';

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
