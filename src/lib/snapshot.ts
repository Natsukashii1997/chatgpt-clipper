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
