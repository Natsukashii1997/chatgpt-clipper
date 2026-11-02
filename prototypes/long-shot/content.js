// 原型① 页面面板：选一条回答，跑 A（CDP 撑高视口）/ B（滚动分段拼接）/ C（离线快照栅格化）
(() => {
  if (window.__clipProto) return;
  window.__clipProto = true;

  const SEL = '[data-chatgpt-search-unit-key$=":assistant"]';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const send = msg => chrome.runtime.sendMessage(msg).then(r => { if (r?.error) throw new Error(r.error); return r; });

  const panel = document.createElement('div');
  panel.id = '__clip-proto';
  panel.style.cssText = 'position:fixed;right:12px;top:60px;z-index:2147483647;background:#fff;color:#000;border:1px solid #999;border-radius:8px;padding:8px;font:12px system-ui;box-shadow:0 2px 8px rgba(0,0,0,.2);display:flex;flex-direction:column;gap:6px;width:230px';
  panel.innerHTML = '<b>原型① 长图</b><select id="__cp-sel"></select>'
    + '<button data-m="A">A CDP 撑高视口</button><button data-m="B">B 滚动分段拼接</button><button data-m="C">C 离线快照栅格化</button>'
    + '<div id="__cp-log" style="white-space:pre-wrap;max-height:220px;overflow:auto"></div>';
  document.body.appendChild(panel);
  const sel = panel.querySelector('#__cp-sel'), log = panel.querySelector('#__cp-log');
  const say = s => { log.textContent = `${s}\n${log.textContent}`; };

  const refresh = () => {
    const cur = sel.value;
    sel.innerHTML = [...document.querySelectorAll(SEL)].map(e => {
      const k = e.dataset.chatgptSearchUnitKey;
      return `<option value="${k}">${k.replace('fallback-', '')} · ${Math.round(e.getBoundingClientRect().height)}px</option>`;
    }).join('');
    if (cur) sel.value = cur;
  };
  sel.addEventListener('focus', refresh);
  refresh();
  setTimeout(refresh, 3000);

  const scroller = el => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e).overflowY; if (s === 'auto' || s === 'scroll') return e; } return document.scrollingElement; };
  const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

  // B：只用视口里“没被悬浮层挡住”的那段，逐段滚动、截可视区、按回答坐标拼起来
  async function shotB(el) {
    const t0 = Date.now(), dpr = devicePixelRatio, sc = scroller(el), keep = sc.scrollTop;
    panel.style.visibility = 'hidden';
    try {
      el.scrollIntoView({ block: 'center' });
      await sleep(300);
      // 沿回答中线逐行命中测试：命中点在滚动容器内、且祖先里没有 fixed/sticky，才算正文可见带
      const er = el.getBoundingClientRect(), x = er.left + er.width / 2, sr = sc.getBoundingClientRect();
      const isContent = y => { let n = document.elementFromPoint(x, y); if (!n || !sc.contains(n)) return false;
        for (; n && n !== sc; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return false; } return true; };
      const mid = (sr.top + sr.bottom) / 2;
      let top = mid, bottom = mid;
      while (top > sr.top && isContent(top - 2)) top -= 2;
      while (bottom < sr.bottom && isContent(bottom + 2)) bottom += 2;
      top = Math.ceil(top) + 2; bottom = Math.floor(bottom) - 2;
      const band = bottom - top;

      const w = Math.round(er.width), h = Math.round(er.height);
      const canvas = new OffscreenCanvas(Math.round(w * dpr), Math.round(h * dpr)), ctx = canvas.getContext('2d');
      const parts = [];
      let done = 0, lastShot = 0;
      while (done < h) {
        sc.scrollTop += el.getBoundingClientRect().top + done - top;
        await sleep(Math.max(350, 600 - (Date.now() - lastShot)));   // captureVisibleTab 每秒最多 2 次
        const r = el.getBoundingClientRect();
        const cropTop = Math.max(top, r.top + done), cropBottom = Math.min(bottom, r.bottom);
        if (cropBottom <= cropTop) throw new Error(`第 ${parts.length + 1} 段无可用区域：滚动到底仍不够`);
        lastShot = Date.now();
        const { dataUrl } = await send({ type: 'visible' });
        const img = await createImageBitmap(await (await fetch(dataUrl)).blob());
        const k = img.width / innerWidth;   // 实际像素比，以截图为准
        ctx.drawImage(img, r.left * k, cropTop * k, w * k, (cropBottom - cropTop) * k,
          0, (cropTop - r.top) * dpr, w * dpr, (cropBottom - cropTop) * dpr);
        parts.push({ cropTop, cropBottom, elTop: Math.round(r.top) });
        done = Math.round(cropBottom - r.top);
      }
      const dataUrl = await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
      return { dataUrl, meta: { method: 'B', ms: Date.now() - t0, band: [top, bottom, band], segments: parts.length, parts, dpr } };
    } finally {
      sc.scrollTop = keep;
      panel.style.visibility = '';
    }
  }

  // C：复制回答 → 逐元素写入计算样式（边框/颜色/填充/尺寸写全，见 LESSONS L-01）→ SVG foreignObject → canvas
  async function shotC(el) {
    const t0 = Date.now(), dpr = devicePixelRatio;
    const ref = document.createElement('iframe');
    ref.style.cssText = 'position:fixed;left:-9999px;width:800px;height:600px';
    document.body.appendChild(ref);
    const rdoc = ref.contentDocument, cache = {};
    const SVGNS = 'http://www.w3.org/2000/svg';
    const def = e => {
      const tag = e.localName, svg = e.namespaceURI === SVGNS;
      if (!cache[tag]) {
        let d;
        if (svg) { const root = rdoc.body.appendChild(rdoc.createElementNS(SVGNS, 'svg')); d = tag === 'svg' ? root : root.appendChild(rdoc.createElementNS(SVGNS, tag)); }
        else d = rdoc.body.appendChild(rdoc.createElement(tag));
        const cs = getComputedStyle(d); cache[tag] = {};
        for (const p of cs) cache[tag][p] = cs.getPropertyValue(p);
      }
      return cache[tag];
    };
    const ALWAYS = /^(border-|outline-|fill|stroke|color$|background-color$|font-family$|font-size$|line-height$|width$|height$)/;
    const clone = el.cloneNode(true);
    const src = [el, ...el.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((e, i) => {
      const cs = getComputedStyle(e), dd = def(e);
      let css = '';
      for (const p of cs) { if (p.startsWith('--')) continue; const v = cs.getPropertyValue(p); if (ALWAYS.test(p) || dd[p] !== v) css += `${p}:${v};`; }
      dst[i].removeAttribute('class');
      dst[i].setAttribute('style', css);
    });
    ref.remove();
    clone.querySelectorAll('script').forEach(n => n.remove());

    const r = el.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    const bg = getComputedStyle(document.body).backgroundColor;
    const wrap = document.createElement('div');
    wrap.setAttribute('style', `width:${w}px;height:${h}px;overflow:hidden;background:${bg === 'rgba(0, 0, 0, 0)' ? '#fff' : bg}`);
    wrap.appendChild(clone);
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${wrap.outerHTML}</body></html>`;
    const svg = `<svg xmlns="${SVGNS}" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%">${new XMLSerializer().serializeToString(wrap)}</foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    const htmlUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    return { dataUrl, htmlUrl, meta: { method: 'C', ms: Date.now() - t0, nodes: src.length, htmlBytes: html.length, svgBytes: svg.length, size: [w, h], dpr } };
  }

  panel.addEventListener('click', async ev => {
    const m = ev.target.dataset?.m;
    if (!m) return;
    const key = sel.value, el = document.querySelector(`[data-chatgpt-search-unit-key="${key}"]`);
    if (!el) return say('找不到所选回答，先点下拉框刷新');
    const turn = key.replace('fallback-', '').replace(/:.*$/, '');
    say(`${turn} ${m} 开始…`);
    try {
      const res = m === 'A' ? await send({ type: 'A', key }) : m === 'B' ? await shotB(el) : await shotC(el);
      await send({ type: 'save', url: res.dataUrl, name: `${turn}-${m}.png` });
      if (res.htmlUrl) await send({ type: 'save', url: res.htmlUrl, name: `${turn}-${m}.html` });
      await send({ type: 'save', url: 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res.meta, null, 1)), name: `${turn}-${m}.json` });
      say(`${turn} ${m} 完成 ${res.meta.ms}ms`);
    } catch (e) {
      say(`${turn} ${m} 失败：${e.message}`);
    }
  });
})();
