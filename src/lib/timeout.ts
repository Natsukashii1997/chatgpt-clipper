// 限时：等浏览器、等后台回话的地方都从这里取时长、用同一个 within()。
// 卡住过的地方见 LESSONS L-13（后台不回话）、L-25、L-26（文件夹句柄、查授权不回）。

/** 一直不回话（不报错也不结束）：到时放弃，由调用方写明卡在哪、给出路 */
export class Stuck extends Error {}

/** 各处最多等多久（毫秒） */
export const LIMITS = {
  /** 读、写插件自己的数据库：读很快；写可能带整张长图 */
  idbRead: 5_000,
  idbWrite: 30_000,
  /** 取出 Vault 文件夹并查授权 */
  dir: 5_000,
  /** 恢复上次没写完的收藏 */
  recover: 15_000,
  /** 内容脚本等后台回话：写文件平常几秒内完成，留足余量给特别长的长图 */
  save: 60_000,
  /** 取一张跨域图片 */
  image: 20_000,
  /** 导出 PDF 的四步；第 1 步含打印页等图片和字体（打印页自己最多等 8 秒） */
  pdfOpen: 20_000,
  pdfAttach: 10_000,
  pdfPrint: 60_000,
  pdfSave: 15_000,
};

/** 取限时。测试里在同一个运行环境设 globalThis.__limits = { dir: 1500 } 改小
 *  （后台、设置页、内容脚本各是各的环境；网页脚本够不到内容脚本的环境） */
export const limit = (k: keyof typeof LIMITS): number =>
  (globalThis as { __limits?: Partial<typeof LIMITS> }).__limits?.[k] ?? LIMITS[k];

/** 给一步操作限时，到时抛 Stuck（「<what> N 秒没回应」）。ms 为 0 不限时 */
export function within<T>(what: string, ms: number, work: Promise<T>): Promise<T> {
  if (!ms) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Stuck(`${what} ${ms / 1000} 秒没回应`)), ms);
  })]).finally(() => clearTimeout(timer));
}
