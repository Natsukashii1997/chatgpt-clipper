// 导出 PDF（FR-15，常浩 2026-11-10 选定）：提问 + 回答，回答用做长图时那份已写好样式、内嵌了图片字体的快照副本，
// 和页面上一个样子，排进 A4 分页；图、表格、代码块整块不跨页，文字可选中。不附长图、不放 Obsidian 的属性区。
// 这里只拼 HTML、分段送给后台；打印和存进「下载」在后台（background.ts printPdf）
import { send } from './ask';
import { PART_CHARS } from './messages';
import { beijingTime } from './naming';
import type { Snapshot } from './snapshot';

/** 一条回答：快照副本的 HTML 和排版宽度；没读成就是 error */
export type PdfAnswer = { html: string; width: number } | { error: string };
/** 一轮：提问 + 后面跟着的回答（单条、节选收藏只有一轮一条） */
export interface PdfRound { question: string; answers: PdfAnswer[] }
export interface PdfDoc { title: string; site: string; url: string; captured: Date; rounds: PdfRound[]; thread?: boolean }

/** 快照副本 → PdfAnswer。要在 embedResources 之后调（图片、字体已换成 data: 地址）。
 *  副本为画长图把每个元素的高度都写死了：分页时一块被挪到下一页，外层不会跟着变高，后面的内容就叠上来。
 *  所以有内容的元素改成高度随内容（没内容的色块、分隔线留着原高度），网格的行高也放开；
 *  有边框或底色、不到半页高的块（卡片、代码框、提示框）整块不拆页 */
export function pdfAnswer(snap: Snapshot): PdfAnswer {
  const root = snap.root.cloneNode(true) as HTMLElement;
  for (const e of root.querySelectorAll<HTMLElement>('*')) {
    if (!(e instanceof HTMLElement) || /^(IMG|CANVAS|VIDEO|HR|STYLE)$/.test(e.tagName)) continue;
    const s = e.style, h = parseFloat(s.height) || 0;
    if (h && h < KEEP_MAX && boxed(s)) s.setProperty('break-inside', 'avoid');
    if (!e.children.length && !e.textContent?.trim()) continue;
    s.setProperty('height', 'auto');
    if (/grid/.test(s.display)) s.setProperty('grid-template-rows', 'none');
  }
  // 懒加载的图片在后台打印页里进不了可视区域，可能一直不加载
  root.querySelectorAll('img[loading]').forEach(img => img.removeAttribute('loading'));
  root.style.setProperty('height', 'auto');
  root.style.setProperty('overflow', 'visible');
  return { html: root.outerHTML, width: snap.width };
}

// 版心高 269mm ≈ 1017 CSS 像素，不到它六成高的框整块挪页，再高的挪了也放不下，照常拆
const KEEP_MAX = 600;
const boxed = (s: CSSStyleDeclaration) => ['top', 'right', 'bottom', 'left'].some(k => parseFloat(s.getPropertyValue(`border-${k}-width`)) > 0
  && !/none|hidden/.test(s.getPropertyValue(`border-${k}-style`)))
  || !/^(|transparent|rgba\(0, 0, 0, 0\))$/.test(s.backgroundColor) || /url|gradient/.test(s.backgroundImage);

/** 拼成打印页的 HTML：颜色跟页面走（深色模式的回答在深色底上，和长图一致） */
export function pdfHtml(d: PdfDoc): string {
  const body = getComputedStyle(document.body), bg = body.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#fff' : body.backgroundColor;
  const { date, time } = beijingTime(d.captured);
  const answers = (r: PdfRound) => r.answers.map(a => ('error' in a
    ? `<p class="miss">这条回答没读成：${esc(a.error)}</p>` : `<div class="ans">${a.html}</div>`)).join('');
  const question = (q: string) => `<div class="q"><b>提问</b><div>${esc(q || '（没找到提问）')}</div></div>`;
  const rounds = d.thread
    ? d.rounds.map((r, i) => {
      const q = r.question.replace(/\s+/g, ' ').trim();
      return `<section><h2>${i + 1}. ${esc(q.length > 30 ? `${q.slice(0, 30)}…` : q || '（没找到提问）')}</h2>${question(r.question)}${answers(r)}</section>`;
    }).join('')
    : d.rounds.map(r => question(r.question) + answers(r)).join('');
  return `<style>${CSS.replace('$BG', bg).replace('$FG', body.color)}</style>`
    + `<header><h1>${esc(d.title)}</h1><div class="meta">${esc(d.site)} · ${date} ${time}（北京时间）<br>${esc(d.url)}</div></header>${rounds}`;
}

/** 分段送到后台打印，存进「下载」：name 文件名（不带 .pdf）。返回页数和下载编号（「在访达中显示」用） */
export async function exportPdf(d: PdfDoc, name: string): Promise<{ pages: number; id: number }> {
  const html = pdfHtml(d), job = crypto.randomUUID();
  const width = Math.max(...d.rounds.flatMap(r => r.answers.map(a => ('width' in a ? a.width : 0))), 1);
  for (let i = 0; i < html.length; i += PART_CHARS) await send({ type: 'pdf-part', job, text: html.slice(i, i + PART_CHARS) }, 0);
  // 不限时：后台打印的每一步自己有限时
  const res = await send({ type: 'pdf', job, name, width }, 0);
  return { pages: res.pages, id: res.ids[0] ?? 0 };
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// 快照里没有类名：「整块不拆」按标签挑，加上 pdfAnswer 里按边框、底色挑出来的框
const CSS = `
html{background:$BG;color:$FG}
body{margin:0;font:13px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Segoe UI",sans-serif}
header{padding-bottom:8px;margin-bottom:12px;border-bottom:1px solid rgba(128,128,128,.3)}
h1{font-size:20px;line-height:1.35;margin:0 0 4px}
.meta{font-size:11px;opacity:.65;overflow-wrap:anywhere}
section{margin-top:22px}
section h2{font-size:15px;margin:0 0 6px;break-after:avoid}
.q{margin:10px 0 14px;padding:8px 12px;border-radius:10px;background:rgba(128,128,128,.12);break-inside:avoid}
.q b{display:block;font-size:11px;opacity:.65}
.q div{white-space:pre-wrap;overflow-wrap:anywhere}
.miss{padding:8px 12px;border-radius:8px;background:rgba(240,164,0,.15)}
.ans+.ans{margin-top:16px}
.ans pre,.ans table,.ans tr,.ans img,.ans svg,.ans figure,.ans blockquote,.ans video{break-inside:avoid!important}
.ans h1,.ans h2,.ans h3,.ans h4,.ans h5,.ans h6{break-after:avoid!important}`;
