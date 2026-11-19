// 内容脚本 ↔ 后台的消息。写 Vault 和下载都只能在后台做：目录句柄的授权属于扩展来源，browser.downloads 只在后台可用。

/** 内容脚本挂在哪些页面；后台补装脚本（FR-9）找标签页也用这一份 */
export const PAGES = ['https://chatgpt.com/*', 'https://claude.ai/*'];

export interface DownloadFile { name: string; url: string }
export type Request =
  | { type: 'save'; id: string; folder: string; files: DownloadFile[] }
  | { type: 'saved'; ids: string[] }
  | { type: 'download'; folder: string; files: DownloadFile[] }
  | { type: 'show'; id: number }
  | { type: 'options' }
  | { type: 'image'; url: string }
  // 整段收藏（FR-13）分批写：开头定文件夹，每张长图一条消息（一起发可能超过消息大小上限），最后写笔记
  | { type: 'thread-begin'; id: string; folder: string }
  | { type: 'thread-file'; folder: string; file: DownloadFile }
  | { type: 'thread-end'; id: string; folder: string; note: DownloadFile; images: string[] }
  // 导出 PDF（FR-15）：排好的 HTML 可能很大（图片都内嵌了），分段送到后台；最后一条 pdf 让后台打印、存进「下载」。
  // name 文件名（不带 .pdf），width 回答排版宽度（按 A4 版心缩放）
  | { type: 'pdf-part'; job: string; text: string }
  | { type: 'pdf'; job: string; name: string; width: number };
/** code：没选文件夹、授权失效，这两种可以去设置页解决 */
export type FailCode = 'no-folder' | 'no-permission';
/** save 的结果：updated 覆盖了这条回答原来的收藏；folder 整段收藏写到的文件夹名；moved 收藏过但原文件夹已不在（被整理走了），没有重写；open 在 Obsidian 里打开笔记的链接（没设置位置时为空）。saved：已收藏的指纹。pages：导出的 PDF 有几页。
 *  image 的结果：dataUrl 是取到的图片 */
export type Response =
  | { ok: true; ids?: number[]; path?: string; folder?: string; updated?: boolean; moved?: boolean; open?: string; saved?: string[]; dataUrl?: string; pages?: number }
  | { ok: false; error: string; code?: FailCode };

/** 下载根目录下的子文件夹，避免和用户的其他下载混在一起 */
export const DOWNLOAD_ROOT = 'chatgpt-clipper';

/** 后台 → 打印页：分段送排好的 HTML，last 那段送完后打印页放进页面、等图片和字体好了再回话 */
export interface PrintPart { type: 'print-part'; text: string; last: boolean }

/** 消息分段的大小（字符）：Chrome 单条消息上限 64MB */
export const PART_CHARS = 8_000_000;
