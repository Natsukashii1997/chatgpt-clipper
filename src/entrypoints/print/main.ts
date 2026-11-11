// 导出 PDF 的打印页（FR-15）：后台在后台标签页里打开它，分段送来排好的 HTML，放进页面、等图片和字体都好了再回话，
// 后台随后接上 debugger 打印成 PDF。HTML 来自快照副本，已去掉脚本和事件属性；扩展页的 CSP 也不执行内联脚本
import type { PrintPart } from '@/lib/messages';

let html = '';
browser.runtime.onMessage.addListener((msg: PrintPart, _sender, reply: (ok: boolean) => void) => {
  if (msg?.type !== 'print-part') return;
  html += msg.text;
  if (!msg.last) return reply(true);
  document.body.innerHTML = html;
  html = '';
  ready().then(() => reply(true), () => reply(true));
  return true;
});

// 等图片解码、字体加载，最多 8 秒：有图片一直不来（网址取不到、懒加载）也照样打印，缺的图留空
async function ready() {
  await Promise.race([
    Promise.all([...[...document.images].map(img => img.decode().catch(() => undefined)), document.fonts.ready]),
    new Promise(r => setTimeout(r, 8000)),
  ]);
}
