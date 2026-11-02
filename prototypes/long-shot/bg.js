// 原型① 后台：A 方案走 CDP；B 方案替页面截可视区；所有结果走 downloads 存到 ~/Downloads/chatgpt-clipper-proto/
const sleep = ms => new Promise(r => setTimeout(r, ms));

function cdp(target, method, params = {}) {
  return chrome.debugger.sendCommand(target, method, params);
}

async function evaluate(target, expression) {
  const res = await cdp(target, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
}

// A：把视口临时撑高到“回答高度 + 600”，让整条回答一次排进视口，再按节点区域截图
async function shotA(tabId, key) {
  const target = { tabId };
  const t0 = Date.now();
  await chrome.debugger.attach(target, '1.3');
  try {
    const sel = JSON.stringify(`[data-chatgpt-search-unit-key="${key}"]`);
    const m = await evaluate(target, `(() => { const el = document.querySelector(${sel}); const p = document.getElementById('__clip-proto'); if (p) p.style.visibility = 'hidden';
      const sc = document.querySelector('.thread-scroll-container'); window.__cpTop = sc.scrollTop;
      return { w: innerWidth, h: Math.ceil(el.getBoundingClientRect().height), dpr: devicePixelRatio }; })()`);
    await cdp(target, 'Emulation.setDeviceMetricsOverride', { width: m.w, height: m.h + 600, deviceScaleFactor: m.dpr, mobile: false });
    await sleep(600);
    const r = await evaluate(target, `(async () => { const el = document.querySelector(${sel}); const sc = document.querySelector('.thread-scroll-container');
      el.scrollIntoView({ block: 'start' }); sc.scrollTop -= 150; await new Promise(r => setTimeout(r, 800));
      const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
    const shot = await cdp(target, 'Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 }, captureBeyondViewport: false, fromSurface: true });
    await cdp(target, 'Emulation.clearDeviceMetricsOverride');
    await sleep(300);
    await evaluate(target, `(() => { const sc = document.querySelector('.thread-scroll-container'); sc.scrollTop = window.__cpTop; const p = document.getElementById('__clip-proto'); if (p) p.style.visibility = ''; })()`);
    return { dataUrl: 'data:image/png;base64,' + shot.data, meta: { method: 'A', ms: Date.now() - t0, rect: r, viewport: [m.w, m.h + 600], dpr: m.dpr } };
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'A') return shotA(sender.tab.id, msg.key);
    if (msg.type === 'visible') return { dataUrl: await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }) };
    if (msg.type === 'save') {
      await chrome.downloads.download({ url: msg.url, filename: `chatgpt-clipper-proto/${msg.name}`, conflictAction: 'overwrite', saveAs: false });
      return { ok: true };
    }
  })().then(reply, e => reply({ error: String(e?.message || e) }));
  return true;
});
