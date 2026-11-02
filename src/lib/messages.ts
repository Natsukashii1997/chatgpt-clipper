// 内容脚本 ↔ 后台的消息。下载只能在后台调 browser.downloads。

export interface DownloadFile { name: string; url: string }
export type Request =
  | { type: 'download'; folder: string; files: DownloadFile[] }
  | { type: 'show'; id: number };
export type Response = { ok: true; ids?: number[] } | { ok: false; error: string };

/** 下载根目录下的子文件夹，避免和用户的其他下载混在一起 */
export const DOWNLOAD_ROOT = 'chatgpt-clipper';
