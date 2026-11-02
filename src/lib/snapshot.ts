// 离线快照（方案 C，docs/recon/2026-11-02-原型1-长图.md）：复制回答 → 逐元素写入计算样式 → SVG foreignObject 栅格化成 PNG。
// 只出 PNG：用户 2026-11-02 决定不要离线 HTML（PRD FR-3）。

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
}

export interface SnapshotOptions {
  /** 不进快照的节点（比如插件自己插进回答里的按钮） */
  exclude?: string;
}

/** 复制回答并写入计算样式 */
export function takeSnapshot(el: HTMLElement, opts: SnapshotOptions = {}): Snapshot {
  const t0 = performance.now();
  const defaults = defaultStyles();
  try {
    const clone = el.cloneNode(true) as HTMLElement;
    const src = [el, ...el.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((e, i) => {
      const cs = getComputedStyle(e), dd = defaults.of(e);
      let css = '';
      for (const p of cs) {
        if (p.startsWith('--')) continue;
        const v = cs.getPropertyValue(p);
        if (ALWAYS.test(p) || dd[p] !== v) css += `${p}:${v};`;
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
      } catch { /* 留空 */ }
    });
    if (opts.exclude) clone.querySelectorAll(opts.exclude).forEach(n => n.remove());
    clean(clone);

    const r = el.getBoundingClientRect(), width = Math.round(r.width), height = Math.round(r.height);
    const root = document.createElement('div');
    root.setAttribute('style', `width:${width}px;height:${height}px;overflow:hidden;background:${pageBackground()}`);
    root.appendChild(clone);
    return { root, width, height, nodes: src.length, ms: Math.round(performance.now() - t0) };
  } finally {
    defaults.dispose();
  }
}

/** 图片和网页字体换成 data: 地址：SVG 当图片画时不加载任何外部资源，不换就是空白框、系统字体（M1 验收 P4、P5）。
 *  同源的直接取；跨域的（图片不带 CORS 头，内容脚本读不到）交给 fetchCrossOrigin（后台按 host_permissions 取）。
 *  取不到的留原样，长图照出 */
export async function embedResources(snap: Snapshot, fetchCrossOrigin: (url: string) => Promise<string>): Promise<void> {
  await Promise.all([embedImages(snap.root, fetchCrossOrigin), embedFonts(snap.root)]);
}

async function embedImages(root: HTMLElement, fetchCrossOrigin: (url: string) => Promise<string>) {
  await Promise.all([...root.querySelectorAll('img')].map(async img => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    const url = new URL(src, location.href);
    img.removeAttribute('srcset');
    try {
      img.setAttribute('src', url.origin === location.origin ? await toDataUrl(url.href) : await fetchCrossOrigin(url.href));
    } catch { /* 留空白框 */ }
  }));
}

// 只嵌回答里用到、页面上已加载的字体（KaTeX 一套 20 个，只用到其中几个）
async function embedFonts(root: HTMLElement) {
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
  const css = (await Promise.all(faces)).filter(Boolean).join('\n');
  if (!css) return;
  const style = document.createElement('style');
  style.textContent = css;
  root.prepend(style);
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
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('画布导出 PNG 失败'))), 'image/png'));
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
