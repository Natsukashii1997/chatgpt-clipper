// 内容脚本（和设置页）↔ 后台的消息。写 Vault 和下载都只能在后台做：目录句柄的授权属于扩展来源，browser.downloads 只在后台可用。
// 每种消息一行：req 是发过去的内容，res 是成功时带回来的内容。发送用 ask.ts 的 ask() / send()，后台按 type 分发（background.ts 的 handlers）。

/** 内容脚本挂在哪些页面；后台补装脚本（FR-9）找标签页也用这一份 */
export const PAGES = ['https://chatgpt.com/*', 'https://claude.ai/*'];

/** 一个文件：名字和 data: 地址（后台只收 data: 地址） */
export interface DownloadFile { name: string; url: string }

export interface Messages {
  /** 单条收藏、节选入库。id 是指纹。path「Vault 文件夹名/收藏文件夹名」；updated 覆盖了这条回答原来的收藏；
   *  moved 收藏过但原文件夹已不在（被整理走了），没有重写；open 在 Obsidian 里打开笔记的链接（没设置位置时为空） */
  save: { req: { id: string; folder: string; files: DownloadFile[] }; res: { path: string; updated?: boolean; moved?: boolean; open: string } };
  /** 这些指纹里哪些已收藏 */
  saved: { req: { ids: string[] }; res: { saved: string[] } };
  /** 退回下载：存到下载目录的 DOWNLOAD_ROOT/folder/ 下，返回下载编号 */
  download: { req: { folder: string; files: DownloadFile[] }; res: { ids: number[] } };
  /** 在访达中显示一个下载好的文件 */
  show: { req: { id: number }; res: object };
  /** 打开设置页 */
  options: { req: object; res: object };
  /** 自检：后台把入库要走的每一步各试一次（vault/diag.ts） */
  diag: { req: object; res: { diag: Diag } };
  /** 取一张跨域图片，返回 data: 地址 */
  image: { req: { url: string }; res: { dataUrl: string } };
  // 整段收藏（FR-13）分批写：开头定文件夹（folder 是定下的收藏文件夹名，job 是暂存任务号），
  // 每张长图一条消息（一起发可能超过消息大小上限），最后送笔记并整组写入；中途失败就取消
  'thread-begin': { req: { id: string; folder: string }; res: { folder: string; job?: string; path: string; updated?: boolean; moved?: boolean } };
  'thread-file': { req: { folder: string; job: string; file: DownloadFile }; res: object };
  'thread-end': { req: { id: string; folder: string; job: string; note: DownloadFile; images: string[] }; res: { path: string; open: string } };
  'thread-cancel': { req: { job: string }; res: object };
  // 导出 PDF（FR-15）：排好的 HTML 可能很大（图片都内嵌了），分段送到后台；最后一条 pdf 让后台打印、存进「下载」。
  // name 文件名（不带 .pdf），width 回答排版宽度（按 A4 版心缩放）；返回下载编号和页数
  'pdf-part': { req: { job: string; text: string }; res: object };
  pdf: { req: { job: string; name: string; width: number }; res: { ids: number[]; pages: number } };
}
export type Kind = keyof Messages;
export type Req<K extends Kind = Kind> = { [T in K]: { type: T } & Messages[T]['req'] }[K];
/** 失败。code：没选文件夹、授权失效，这两种可以去设置页解决 */
export type FailCode = 'no-folder' | 'no-permission';
export interface Failure { ok: false; error: string; code?: FailCode }
export type Ok<K extends Kind> = { ok: true } & Messages[K]['res'];
export type Reply<K extends Kind = Kind> = Ok<K> | Failure;

/** 自检结果：build 是这份代码的打包时间（看浏览器里跑的是不是最新版），steps 是每一步通不通、用时（毫秒）；page 是设置页上一次自检的结果 */
export interface DiagStep { step: string; ms: number; out: string }
export interface Diag { build: string; steps: DiagStep[]; page?: { at: number; steps: DiagStep[] } }
/** 打包时间（ISO），wxt.config.ts 在打包时写入 */
declare const __BUILD__: string;
export const BUILD = __BUILD__;

/** 下载根目录下的子文件夹，避免和用户的其他下载混在一起 */
export const DOWNLOAD_ROOT = 'chatgpt-clipper';

/** 后台 → 打印页：分段送排好的 HTML，last 那段送完后打印页放进页面、等图片和字体好了再回话 */
export interface PrintPart { type: 'print-part'; text: string; last: boolean }

/** 消息分段的大小（字符）：Chrome 单条消息上限 64MB */
export const PART_CHARS = 8_000_000;
