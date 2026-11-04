// 内容脚本 ↔ 后台的消息。写 Vault 和下载都只能在后台做：目录句柄的授权属于扩展来源，browser.downloads 只在后台可用。

export interface DownloadFile { name: string; url: string }
export type Request =
  | { type: 'save'; id: string; folder: string; files: DownloadFile[] }
  | { type: 'saved'; ids: string[] }
  | { type: 'why'; id: string; why: string }
  | { type: 'download'; folder: string; files: DownloadFile[] }
  | { type: 'show'; id: number }
  | { type: 'options' }
  | { type: 'image'; url: string }
  // 整段收藏（FR-13）分批写：开头定文件夹，每张长图一条消息（一起发可能超过消息大小上限），最后写笔记
  | { type: 'thread-begin'; id: string; folder: string }
  | { type: 'thread-file'; folder: string; file: DownloadFile }
  | { type: 'thread-end'; id: string; folder: string; note: DownloadFile; images: string[] };
/** code：没选文件夹、授权失效，这两种可以去设置页解决 */
export type FailCode = 'no-folder' | 'no-permission';
/** save 的结果：updated 覆盖了这条回答原来的收藏；folder 整段收藏写到的文件夹名；moved 收藏过但原文件夹已不在（被整理走了），没有重写；why 笔记里的「为什么存」；open 在 Obsidian 里打开笔记的链接（没设置位置时为空）。saved：已收藏的指纹。
 *  image 的结果：dataUrl 是取到的图片 */
export type Response =
  | { ok: true; ids?: number[]; path?: string; folder?: string; updated?: boolean; moved?: boolean; why?: string; open?: string; saved?: string[]; dataUrl?: string }
  | { ok: false; error: string; code?: FailCode };

/** 下载根目录下的子文件夹，避免和用户的其他下载混在一起 */
export const DOWNLOAD_ROOT = 'chatgpt-clipper';
