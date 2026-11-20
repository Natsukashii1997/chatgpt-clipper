import { BUILD, DOWNLOAD_ROOT, PAGES, PART_CHARS, type DiagStep, type DownloadFile, type Failure, type Kind, type Messages, type PrintPart, type Req } from '@/lib/messages';
import { limit, Stuck, within } from '@/lib/timeout';
import { beginThread, cancelThread, diagnose, endThread, findDir, getSaved, loadPageDiag, loadWhere, obsidianUrl, saveCollection, stageThreadFile } from '@/lib/vault';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Req, sender, reply: (r: unknown) => void) => {
    // 插件自己的页面（设置页）发来的才算自己人；内容脚本发来的，sender.url 是网页地址
    handle(msg, !!sender.url?.startsWith(browser.runtime.getURL(''))).then(reply, (e: Error) => reply({ ok: false, error: e.message }));
    return true;
  });
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install' || reason === 'update') void reinject();
  });
});

// 插件安装、更新、重新加载后，Chrome 不给已开的页面换新脚本，旧脚本和后台断了联系（L-10、L-13，全局 G-35）。
// 给已开的 ChatGPT / Claude 页面补装一份，旧的一份让位（content.ts 的 ctx.onInvalidated），不用刷新页面就能收藏
// （FR-9，常浩 2026-11-19 选「只补装」）。补装不上的页面（休眠的标签页等）旧脚本照旧提醒刷新
async function reinject() {
  for (const tab of await browser.tabs.query({ url: PAGES })) {
    if (tab.id === undefined) continue;
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/content.js'] })
      .catch((e: Error) => console.warn(`[chatgpt-clipper] 标签页 ${tab.id} 没补装上，页面上会提醒刷新`, e.message));
  }
}

async function handle(msg: Req, own = false): Promise<unknown> {
  const run = handlers[msg.type] as ((m: Req, own: boolean) => Promise<object | Failure>) | undefined;
  if (!run) return { ok: false, error: '未知消息' };
  const res = await run(msg, own);
  return 'ok' in res ? res : { ok: true, ...res };
}

/** 每种消息怎么处理：返回成功时带回去的内容（messages.ts 里的 res），或一个失败 */
type Handlers = { [K in Kind]: (msg: Req<K>, own: boolean) => Promise<Messages[K]['res'] | Failure> };
const handlers: Handlers = {
  async save(msg) {
    const v = await vaultDir();
    if ('ok' in v) return v;
    const files = await Promise.all(msg.files.map(async f => ({ name: f.name, data: await fileBlob(f) })));
    const r = await saveCollection(v.dir, msg.id, msg.folder, files);
    const where = await loadWhere(), note = files.find(f => f.name.endsWith('.md'))?.name;
    return { path: `${v.dir.name}/${r.name}`, updated: r.updated, moved: r.moved, open: where && note && !r.moved ? obsidianUrl(where, r.name, note) : '' };
  },
  async saved(msg) {
    const hit = await Promise.all(msg.ids.map(getSaved));
    return { saved: msg.ids.filter((_, i) => hit[i]) };
  },
  async download(msg) {
    const ids: number[] = [];
    for (const f of msg.files) {
      dataOnly(f);
      ids.push(await browser.downloads.download({ url: f.url, filename: `${DOWNLOAD_ROOT}/${msg.folder}/${f.name}`, conflictAction: 'uniquify', saveAs: false }));
    }
    return { ids };
  },
  async show(msg) {
    browser.downloads.show(msg.id);
    return {};
  },
  async options() {
    await browser.runtime.openOptionsPage();
    return {};
  },
  async diag(_msg, own) {
    // 页面上的 clipper-diag 事件网页脚本也能触发：不是设置页问的，就不带已收藏条数
    const steps = await diagnose(), page = await loadPageDiag().catch(() => undefined);
    return { diag: own ? { build: BUILD, steps, page } : { build: BUILD, steps: steps.map(noCounts), page: page && { ...page, steps: page.steps.map(noCounts) } } };
  },
  async image(msg) {
    return { dataUrl: await imageDataUrl(msg.url) };
  },
  async 'thread-begin'(msg) {
    const v = await vaultDir();
    if ('ok' in v) return v;
    const r = await beginThread(v.dir, msg.id, msg.folder);
    return { folder: r.name, job: r.job, path: `${v.dir.name}/${r.name}`, updated: r.updated, moved: r.moved };
  },
  async 'thread-file'(msg) {
    const v = await vaultDir();
    if ('ok' in v) return v;
    await stageThreadFile(v.dir, msg.job, { name: msg.file.name, data: await fileBlob(msg.file) });
    return {};
  },
  async 'thread-end'(msg) {
    const v = await vaultDir();
    if ('ok' in v) return v;
    await endThread(v.dir, msg.id, msg.folder, { name: msg.note.name, data: await fileBlob(msg.note) }, msg.images, msg.job);
    const where = await loadWhere();
    return { path: `${v.dir.name}/${msg.folder}`, open: where ? obsidianUrl(where, msg.folder, msg.note.name) : '' };
  },
  // 取消只清本机暂存，不查 Vault 文件夹和授权
  async 'thread-cancel'(msg) {
    await cancelThread(msg.job);
    return {};
  },
  async 'pdf-part'(msg) {
    pdfParts.set(msg.job, (pdfParts.get(msg.job) ?? '') + msg.text);
    return {};
  },
  async pdf(msg) {
    const html = pdfParts.get(msg.job) ?? '';
    pdfParts.delete(msg.job);
    if (!html) return { ok: false, error: '要导出的内容没送到后台' };
    return printPdf(html, msg.name, msg.width);
  },
};

/** 写 Vault 之前：取出文件夹并确认有授权；不行就给出失败原因（去设置页能解决的带 code） */
async function vaultDir(): Promise<{ dir: FileSystemDirectoryHandle } | Failure> {
  const { dir, state, waited } = await findDir();
  if (state === 'stuck') return { ok: false, code: 'no-permission',
    error: `读不出${dir ? `文件夹「${dir.name}」` : ' Vault 文件夹'}的授权（浏览器 ${waited / 1000} 秒没回应），去设置页重新选一次文件夹` };
  if (!dir) return { ok: false, code: 'no-folder', error: '还没选 Vault 文件夹' };
  if (state !== 'granted') return { ok: false, code: 'no-permission', error: `文件夹「${dir.name}」的授权已失效` };
  return { dir };
}

/** 内容脚本送来的文件都是 data: 地址。别的地址不取、不下载：后台有图片域名的权限，不替别人取东西 */
function dataOnly(f: DownloadFile) {
  if (!f.url.startsWith('data:')) throw new Error(`文件「${f.name}」不是 data: 地址，没有处理`);
}
async function fileBlob(f: DownloadFile): Promise<Blob> {
  dataOnly(f);
  return (await fetch(f.url)).blob();
}

/** 自检结果里去掉已收藏条数（和总条数，减一下就是它） */
const noCounts = (s: DiagStep): DiagStep => ({ ...s, out: s.out.replace(/共 \d+ 条：已收藏 \d+，/, '') });

// 长图里的跨域图片：页面不给 CORS 头，内容脚本读不到，由后台按 host_permissions 取（用户 2026-11-02 同意只加这两个域名）。
// 和 wxt.config.ts 的 host_permissions 保持一致；只取图片，不带任何东西出去
const IMAGE_HOSTS = /^(images\.openai\.com|([\w-]+\.)+oaiusercontent\.com)$/;

async function imageDataUrl(url: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !IMAGE_HOSTS.test(u.hostname)) throw new Error(`不取这个域名的图片：${u.hostname}`);
  const res = await fetch(u, { credentials: 'omit' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) throw new Error(`图片取不到：${res.status} ${type}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type.split(';')[0]};base64,${btoa(bin)}`;
}

// 导出 PDF（FR-15，常浩 2026-11-10 选 A 版、确认加 debugger 权限）：内容脚本分段送来的 HTML 先攒在这里（导出任务号 → 已收到的 HTML）
const pdfParts = new Map<string, string>();

// A4，上下页边距 14mm、左右 12mm；版心宽 186mm = 703 CSS 像素，回答比这宽就整页按比例缩小
const A4 = { paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.55, marginBottom: 0.55, marginLeft: 0.47, marginRight: 0.47 };
const PRINT_WIDTH = 703;

// 每一步限时（timeout.ts 的 pdfOpen / pdfAttach / pdfPrint / pdfSave）：哪一步卡住就停下，写清卡在第几步，卡片不会一直「正在导出」
// （2026-11-10 常浩在真实 Chrome 里卡住过，原因未查清）

/** 在后台标签页里打开插件自己的打印页，放进 HTML，接上 debugger 用 Page.printToPDF 打印（不弹打印框），
 *  存进「下载」根目录（重名加序号），导完断开、关掉标签页。返回下载编号和页数 */
async function printPdf(html: string, name: string, width: number): Promise<{ ids: number[]; pages: number }> {
  const tab = await browser.tabs.create({ url: browser.runtime.getURL('/print.html'), active: false });
  const target = { tabId: tab.id! };
  let attached = false;
  try {
    await step(1, '打开打印页', limit('pdfOpen'), (async () => {
      for (let i = 0; i < html.length || i === 0; i += PART_CHARS)
        await toPrintPage(tab.id!, { type: 'print-part', text: html.slice(i, i + PART_CHARS), last: i + PART_CHARS >= html.length });
    })());
    await step(2, '接上调试', limit('pdfAttach'), browser.debugger.attach(target, '1.3'));
    attached = true;
    const { data } = (await step(3, '打印', limit('pdfPrint'), browser.debugger.sendCommand(target, 'Page.printToPDF',
      { ...A4, printBackground: true, scale: Math.max(0.1, Math.min(1, PRINT_WIDTH / Math.max(width, 1))) }))) as { data: string };
    const pages = atob(data).match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
    const id = await step(4, '存进下载', limit('pdfSave'),
      browser.downloads.download({ url: `data:application/pdf;base64,${data}`, filename: `${name}.pdf`, conflictAction: 'uniquify', saveAs: false }));
    return { ids: [id], pages };
  } finally {
    if (attached) await browser.debugger.detach(target).catch(() => undefined);
    await browser.tabs.remove(tab.id!).catch(() => undefined);
  }
}

/** 导出的一步：超时或出错都报「第 n 步「名字」…」；每步用时打在后台控制台，便于排查 */
async function step<T>(no: number, name: string, ms: number, work: Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await within(name, ms, work);
  } catch (e) {
    if (e instanceof Stuck) throw new Error(`第 ${no} 步「${name}」超过 ${ms / 1000} 秒没完成，点「重试」再导一次`);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`第 ${no} 步「${name}」：${debuggerError(msg)}`);
  } finally {
    console.info(`[chatgpt-clipper] 导出 PDF 第 ${no} 步「${name}」用了 ${Math.round(performance.now() - t0)}ms`);
  }
}

/** Chrome 调试接口的英文报错换成说得清怎么办的中文；认不出的原样给 */
function debuggerError(msg: string): string {
  if (/already attached/i.test(msg)) return '打印页正被别的调试工具占用，关掉后点「重试」';
  if (/detached|not attached|cancel/i.test(msg)) return '导出被打断了（可能点了顶部提示条上的「取消」），点「重试」再导一次';
  return msg;
}

/** 给打印页发一段；页面脚本还没跑起来时（刚开的标签页）每 100ms 重试，5 秒还不行就报错 */
async function toPrintPage(tabId: number, part: PrintPart) {
  for (let t = 0; ; t += 100) {
    try {
      return await browser.tabs.sendMessage(tabId, part);
    } catch (e) {
      if (t >= 5000) throw new Error(`打印页没打开：${e instanceof Error ? e.message : String(e)}`);
      await new Promise(r => setTimeout(r, 100));
    }
  }
}
