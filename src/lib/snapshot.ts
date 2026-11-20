// 离线快照（方案 C，docs/recon/2026-11-02-原型1-长图.md）：复制回答 → 逐元素写入计算样式 → SVG foreignObject 栅格化成 PNG。
// 只出 PNG：用户 2026-11-02 决定不要离线 HTML（PRD FR-3）。
import { MD } from './adapter';

const SVGNS = 'http://www.w3.org/2000/svg';
// 这些属性一律写全，不和默认值比较：Tailwind 预设 `border: 0 solid`，比较后会漏掉宽度 0，只剩 solid → 粗黑框（LESSONS L-01）
const ALWAYS = /^(border-|outline-|fill|stroke|color$|background-color$|font-family$|font-size$|line-height$|width$|height$)/;
// Chrome 画布单边上限 32767px，超长回答按比例降低像素比
const MAX_CANVAS_SIDE = 32767;

export interface Snapshot {
  /** 已内联样式、去掉类名和脚本的副本，外面包一层定宽定高的容器 */
  root: HTMLElement;
  width: number;
  height: number;
  nodes: number;
  ms: number;
  /** 导不出画面、在长图里留了空白的 canvas 个数（被跨域内容污染过的画布） */
  blanks: number;
}

export interface SnapshotOptions {
  /** 不进快照的节点（比如插件自己插进回答里的按钮） */
  exclude?: string;
  /** 长代码编辑器 → 读全时复制下来的每一行（已写好样式），换掉副本里只渲染了一部分的行（M1 验收 P9） */
  codeLines?: Map<Element, HTMLElement[]>;
  /** 要去掉、又占位置的界面（Claude 的思考过程行、按钮行）：去掉后按剩下的内容重新量高 */
  drop?: string;
}

/** 写样式的工具：比较时用的浏览器默认样式放在一个临时 iframe 里，用完 dispose */
export function styler() {
  const defaults = defaultStyles();
  const css = (e: Element) => {
    const cs = getComputedStyle(e), dd = defaults.of(e);
    let out = '';
    for (const p of cs) {
      if (p.startsWith('--')) continue;
      const v = cs.getPropertyValue(p);
      if (ALWAYS.test(p) || dd[p] !== v) out += `${p}:${v};`;
    }
    return out;
  };
  return {
    css,
    /** 复制一个元素，自己和后代都写上计算样式、去掉类名 */
    copy(el: Element): HTMLElement {
      const c = el.cloneNode(true) as HTMLElement;
      const src = [el, ...el.querySelectorAll('*')], dst = [c, ...c.querySelectorAll('*')];
      src.forEach((e, i) => { dst[i]!.removeAttribute('class'); dst[i]!.setAttribute('style', css(e)); });
      return c;
    },
    dispose: defaults.dispose,
  };
}

/** 复制回答并写入计算样式。能滚动的区域不画滚动条；代码块里纵向滚动的代码框展开显示全部代码（M1 验收 P9、P15） */
export function takeSnapshot(el: HTMLElement, opts: SnapshotOptions = {}): Snapshot {
  const t0 = performance.now();
  const st = styler();
  try {
    const clone = el.cloneNode(true) as HTMLElement;
    const src = [el, ...el.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
    const expand: HTMLElement[] = [], margins = new Map<Element, number>();
    let blanks = 0;
    src.forEach((e, i) => {
      const cs = getComputedStyle(e);
      let css = st.css(e);
      const mb = bottomMargin(e, margins);
      if (mb !== (parseFloat(cs.marginBottom) || 0)) css += `margin-bottom:${mb}px;`;
      if (/auto|scroll/.test(cs.overflowX + cs.overflowY)) {
        // SVG 里画出来是老式滚动条（页面上是悬浮的、看不见）：一律只裁剪不滚动
        if (e.closest(MD.codeBlock) && /auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight) {
          css += 'height:auto;max-height:none;overflow-x:clip;overflow-y:visible;';
          expand.push(dst[i] as HTMLElement);
        } else css += 'overflow:hidden;';
      }
      const d = dst[i]!;   // 副本与原件逐个对应
      d.removeAttribute('class');
      d.setAttribute('style', css);
      // 脚本画的 canvas（如交互公式卡片的函数图）复制出来是空的，换成当前画面的图片；跨域污染过的画布导不出，留空
      if (e instanceof HTMLCanvasElement) try {
        const img = document.createElement('img');
        img.setAttribute('src', e.toDataURL());
        img.setAttribute('style', css);
        d.replaceWith(img);
      } catch { blanks++; /* 留空，算进「没取到的图」 */ }
      // 只渲染了一部分的长代码：换成读全时复制下来的行，占位块一起去掉
      const lines = opts.codeLines?.get(e);
      if (lines) d.replaceChildren(...lines);
    });
    if (opts.exclude) clone.querySelectorAll(opts.exclude).forEach(n => n.remove());
    clean(clone);
    // 代码框展开后变高、去掉界面后变矮：外面各层写死的高度改成随内容；网格的行高在计算样式里也是写死的 px（真实页面代码框外有一层网格）
    const loose = expand.map(p => p.parentElement);
    if (opts.drop) clone.querySelectorAll(opts.drop).forEach(n => { loose.push(n.parentElement); n.remove(); });
    for (const start of loose)
      for (let a = start; a; a = a.parentElement) {
        a.style.setProperty('height', 'auto');
        if (/grid/.test(a.style.display)) a.style.setProperty('grid-template-rows', 'none');
      }

    const r = el.getBoundingClientRect(), width = Math.round(r.width);
    const height = loose.length ? measure(clone, width) : Math.round(r.height);
    const root = document.createElement('div');
    root.setAttribute('style', `width:${width}px;height:${height}px;overflow:hidden;background:${pageBackground()}`);
    root.appendChild(clone);
    return { root, width, height, nodes: src.length, ms: Math.round(performance.now() - t0), blanks };
  } finally {
    st.dispose();
  }
}

// 页面上元素底部实际"穿出去"的下外边距：最后一个子元素的下外边距穿过它、和它自己的合并（比如代码块里 pre 的 16px）。
// 副本写死了高度，子元素的外边距穿不出来，要补到这个元素自己身上，否则下面的内容上移。
// 判断看页面上的位置：它没有下内边距和下边框、底边正好贴着最后一个子元素的底边
function bottomMargin(e: Element, memo: Map<Element, number>): number {
  let m = memo.get(e);
  if (m !== undefined) return m;
  const cs = getComputedStyle(e), own = parseFloat(cs.marginBottom) || 0, c = e.lastElementChild;
  m = own;
  if (c && cs.display === 'block' && cs.overflow === 'visible' && !parseFloat(cs.paddingBottom) && !parseFloat(cs.borderBottomWidth)) {
    const cc = getComputedStyle(c);
    if (/^(block|list-item|table)$/.test(cc.display) && cc.float === 'none' && !/absolute|fixed/.test(cc.position)
      && Math.abs(e.getBoundingClientRect().bottom - c.getBoundingClientRect().bottom) < 0.5) {
      const inner = bottomMargin(c, memo);   // 合并规则：最大的正值加最小的负值
      m = Math.max(own, inner, 0) + Math.min(own, inner, 0);
    }
  }
  memo.set(e, m);
  return m;
}

// 副本只靠写好的样式排版：放进页面外的 shadow root（不受页面样式表影响，和画进 SVG 时一样）量高度
function measure(clone: HTMLElement, width: number): number {
  const host = document.createElement('div');
  host.style.cssText = `position:absolute;left:-100000px;top:0;width:${width}px`;
  const box = document.createElement('div');
  box.style.cssText = `width:${width}px`;
  host.attachShadow({ mode: 'open' }).appendChild(box);
  document.body.appendChild(host);
  try {
    box.appendChild(clone);
    return Math.ceil(box.getBoundingClientRect().height);
  } finally {
    box.removeChild(clone);
    host.remove();
  }
}

/** 图片和网页字体换成 data: 地址：SVG 当图片画时不加载任何外部资源，不换就是空白框、系统字体（M1 验收 P4、P5）。
 *  同源的直接取；跨域的（图片不带 CORS 头，内容脚本读不到）交给 fetchCrossOrigin（后台按 host_permissions 取）。
 *  取不到的留原样，长图照出；返回没嵌进去的数量（图片里含导不出画面的 canvas），由调用方标黄，不再悄悄留空白框、换系统字体 */
export interface Missed { images: number; fonts: number }
export async function embedResources(snap: Snapshot, fetchCrossOrigin: (url: string) => Promise<string>): Promise<Missed> {
  const [images, fonts] = await Promise.all([embedImages(snap.root, fetchCrossOrigin), embedFonts(snap.root)]);
  return { images: images + snap.blanks, fonts };
}

// 小图标不计入「没取到」：来源胶囊里的网站图标来自各家网站，插件没有权限取，M1 验收时已接受它留空（验收矩阵第 2 行）
const ICON_MAX = 32;

/** 返回没取到的图片张数（小图标不算） */
async function embedImages(root: HTMLElement, fetchCrossOrigin: (url: string) => Promise<string>): Promise<number> {
  let missed = 0;
  await Promise.all([...root.querySelectorAll('img')].map(async img => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    const url = new URL(src, location.href);
    img.removeAttribute('srcset');
    try {
      img.setAttribute('src', url.origin === location.origin ? await toDataUrl(url.href) : await fetchCrossOrigin(url.href));
    } catch {
      // 留空白框。宽高是做快照时写死的计算值
      const w = parseFloat(img.style.width), h = parseFloat(img.style.height);
      if (!(w <= ICON_MAX && h <= ICON_MAX)) missed++;
    }
  }));
  return missed;
}

// 只嵌回答里用到、页面上已加载的字体（KaTeX 一套 20 个，只用到其中几个）。返回该嵌却没取到的字体文件数；
// 样式表跨域、读不了规则的那些字体不在其内（不知道它们有没有用到）
async function embedFonts(root: HTMLElement): Promise<number> {
  const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, '');
  const weight = (v: string) => ({ '': '400', normal: '400', bold: '700' })[v] ?? v;
  const used = new Set<string>();
  for (const e of [root, ...root.querySelectorAll<HTMLElement>('*')]) for (const f of e.style.fontFamily.split(',')) used.add(unquote(f));
  const loaded = new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => `${unquote(f.family)}|${weight(f.weight)}|${f.style}`));
  const faces: Promise<string>[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }   // 跨域样式表读不了规则
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const fam = unquote(r.style.getPropertyValue('font-family')), w = weight(r.style.getPropertyValue('font-weight')), st = r.style.getPropertyValue('font-style') || 'normal';
      const src = r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/)?.[1];
      if (!src || !used.has(fam) || !loaded.has(`${fam}|${w}|${st}`)) continue;
      const range = r.style.getPropertyValue('unicode-range');
      faces.push(toDataUrl(new URL(src, sheet.href ?? location.href).href)
        .then(data => `@font-face{font-family:"${fam}";font-weight:${w};font-style:${st};${range ? `unicode-range:${range};` : ''}src:url(${data})}`, () => ''));
    }
  }
  const got = (await Promise.all(faces)).filter(Boolean), css = got.join('\n');
  if (css) {
    const style = document.createElement('style');
    style.textContent = css;
    root.prepend(style);
  }
  return faces.length - got.length;
}

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** 栅格化成 PNG；像素比默认跟屏幕一致 */
export async function toPng(snap: Snapshot, dpr = devicePixelRatio): Promise<Blob> {
  const { width: w, height: h } = snap;
  const scale = Math.min(dpr, MAX_CANVAS_SIDE / Math.max(w, h));
  const svg = `<svg xmlns="${SVGNS}" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%">`
    + `${new XMLSerializer().serializeToString(snap.root)}</foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error(`画布导出 PNG 失败（${canvas.width}×${canvas.height}）`))), 'image/png'));
}

// 浏览器默认样式：在空白 iframe 里各建一个同名元素读计算样式，按标签缓存
function defaultStyles() {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!, cache: Record<string, Record<string, string>> = {};
  return {
    of(e: Element) {
      const svg = e.namespaceURI === SVGNS, key = `${svg ? 'svg:' : ''}${e.localName}`;
      if (!cache[key]) {
        let d: Element;
        if (svg) {
          const root = doc.body.appendChild(doc.createElementNS(SVGNS, 'svg'));
          d = e.localName === 'svg' ? root : root.appendChild(doc.createElementNS(SVGNS, e.localName));
        } else d = doc.body.appendChild(doc.createElement(e.localName));
        const cs = getComputedStyle(d);
        cache[key] = {};
        for (const p of cs) cache[key][p] = cs.getPropertyValue(p);
      }
      return cache[key];
    },
    dispose: () => frame.remove(),
  };
}

// 去掉脚本、事件属性和 javascript: 链接（PRD 第 6 节），快照里不留可执行的东西
function clean(root: HTMLElement) {
  root.querySelectorAll('script, noscript').forEach(n => n.remove());
  for (const e of [root, ...root.querySelectorAll('*')])
    for (const a of [...e.attributes])
      if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) e.removeAttribute(a.name);
}

function pageBackground(): string {
  const bg = getComputedStyle(document.body).backgroundColor;
  return bg === 'rgba(0, 0, 0, 0)' ? '#fff' : bg;
}
