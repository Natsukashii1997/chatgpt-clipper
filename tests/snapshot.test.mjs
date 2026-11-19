// 快照模块的端到端测试：Playwright 启动带插件的 Chromium，把固定测试页伪装成 chatgpt.com 打开，
// 点「收藏」，检查下载下来的 PNG。测试页内容是编的（tests/fixtures/card-answer.html）。
// 需要 Playwright 自带的 Chromium（正式版 Chrome 不支持命令行加载未打包插件）：npx playwright install chromium
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXT = path.join(ROOT, '.output/chrome-mv3');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/card-answer.html'), 'utf8');
const URL = 'https://chatgpt.com/c/fixture';
const CLAUDE_FIXTURE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/claude-answer.html'), 'utf8');
const CLAUDE_URL = 'https://claude.ai/chat/fixture';
// 改版自检的误报场景：对话 12 秒后才出来（页面还在加载）；只有一问、回答还没出来（第一问还在生成）
const CLAUDE_SLOW_URL = 'https://claude.ai/chat/slow', CLAUDE_THINKING_URL = 'https://claude.ai/chat/thinking';
// 改版：ChatGPT 测试页（两问两答）的回答标记改掉，插件认不出
const BROKEN_URL = 'https://chatgpt.com/c/broken';
// 改版自检的误报场景（2026-11-11）：同样认不出回答，但页面前 14 秒一直在变——一页不停加节点（流式输出），一页只改文字（「思考 N 秒」计时）
const GROWING_URL = 'https://chatgpt.com/c/growing', TICKING_URL = 'https://chatgpt.com/c/ticking';
const BROKEN_FIXTURE = FIXTURE.replaceAll(':assistant"', ':assistant-x"');
// Claude Code 的会话页：同一份回答标记，但不是聊天对话
const CLAUDE_CODE_URL = 'https://claude.ai/code/session_fixture';
// 生成图片的对话：回答没有「…:assistant」标记（2026-11-18 侦察）
const IMAGE_ANSWER_URL = 'https://chatgpt.com/c/image', IMAGE_ANSWER_FIXTURE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/image-answer.html'), 'utf8');
// 多轮对话，虚拟列表（整段收藏用）
const THREAD_FIXTURE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/claude-thread.html'), 'utf8'), THREAD_URL = 'https://claude.ai/chat/thread';
// 第十节的外部资源：字体与页面同源；图片跨域且不带 CORS 头，和真实页面的 images.openai.com 一样内容脚本读不到
const FONT_URL = 'https://chatgpt.com/cdn/assets/TestFont.ttf', FONT = fs.readFileSync('/System/Library/Fonts/Supplemental/Zapfino.ttf');
const IMAGE_URL = 'https://images.openai.com/fixture/bridge.svg';
const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#d9480f"/><circle cx="120" cy="60" r="40" fill="#1c7ed6"/></svg>';
const ANSWER = '[data-chatgpt-search-unit-key="fallback-turn-2:1:assistant"]';
// 单像素任一通道差超过 PIXEL_TOL 算不同；不同像素占比上限。快照与真实渲染只差字形抗锯齿（同一 Chromium 下实测 0.48%；原型①在真实 Chrome 里与 CDP 截图比是 4–6%）
const PIXEL_TOL = 24, MAX_DIFF_RATIO = 0.03;

let ctx, page, dir, result;

before(async () => {
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore' });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipper-test-'));
  ctx = await chromium.launchPersistentContext(path.join(dir, 'profile'), {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 1,
    downloadsPath: path.join(dir, 'downloads'),
    // 后两项给「插件更新后补装」的用例真重载插件用（浏览器级 CDP 的 Extensions.loadUnpacked，L-21 补充）；端口随机，写在 profile/DevToolsActivePort
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--enable-unsafe-extension-debugging', '--remote-debugging-port=0'],
  });
  // 测试里要读剪贴板核对长图（FR-14）；用的是 Mac 的系统剪贴板，跑完会被清空（L-17）
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  // 只放行测试页，其余请求一律拦掉，顺带保证快照不依赖网络
  await ctx.route('**/*', route => {
    const url = route.request().url();
    // 插件自己的页面（导出 PDF 的打印页）照常放行
    if (url.startsWith('chrome-extension://')) return route.continue();
    if (url.startsWith(URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: FIXTURE });
    if (url.startsWith(CLAUDE_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: CLAUDE_FIXTURE });
    if (url.startsWith(THREAD_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: THREAD_FIXTURE });
    if (url.startsWith(CLAUDE_CODE_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: CLAUDE_FIXTURE });
    if (url.startsWith(IMAGE_ANSWER_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: IMAGE_ANSWER_FIXTURE });
    // 模拟 Claude 改版：回答换了标记，插件认不出
    if (url.startsWith(BROKEN_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: BROKEN_FIXTURE });
    if (url.startsWith(GROWING_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8',
      body: BROKEN_FIXTURE.replace('</body>', '<script>{ let n = 0; const t = setInterval(() => { document.body.append(document.createElement(\'p\')); if (++n >= 14) clearInterval(t); }, 1000); }</script></body>') });
    if (url.startsWith(TICKING_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8',
      body: BROKEN_FIXTURE.replace('</body>', '<script>{ let n = 0; const p = document.createElement(\'p\'); p.textContent = \'思考 0 秒\'; document.querySelector(\'main\').append(p); const t = p.firstChild; const i = setInterval(() => { t.data = `思考 ${++n} 秒`; if (n >= 14) clearInterval(i); }, 1000); }</script></body>') });
    if (url.startsWith(CLAUDE_SLOW_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8',
      body: CLAUDE_FIXTURE.replace('</body>', '<script>{ const b = document.body, kids = [...b.childNodes]; kids.forEach(k => k.remove()); setTimeout(() => kids.forEach(k => b.appendChild(k)), 12_000); }</script></body>') });
    if (url.startsWith(CLAUDE_THINKING_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8',
      body: CLAUDE_FIXTURE.replace('</body>', '<script>document.querySelectorAll(\'[data-testid="user-message"]\').forEach((u, i) => i && u.remove()); document.querySelectorAll(\'[data-testid="assistant-message"]\').forEach(a => a.remove());</script></body>') });
    if (url === FONT_URL) return route.fulfill({ contentType: 'font/ttf', body: FONT });
    if (url === IMAGE_URL) return route.fulfill({ contentType: 'image/svg+xml', body: IMAGE });
    return route.abort();
  });
  page = await ctx.newPage();
  await page.goto(URL);
  await page.locator(`${ANSWER} clipper-ribbon`).waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#media img').evaluate(img => img.decode());

  const answer = page.locator(ANSWER);
  const box = await answer.boundingBox();
  const baseline = await answer.screenshot();   // 浏览器真实渲染，作对比基准；先截，免得截进进度卡
  const ribbon = await page.locator(`${ANSWER} clipper-ribbon button`).boundingBox();
  const clip = await page.locator('.clip').boundingBox();
  // 各块相对回答左上角的位置：同一时刻量（截基准图会滚动页面，分开取的 boundingBox 坐标对不上，L-11）。
  // panes：代码块里能纵向滚动的代码框，长图里要展开，extra 是展开后多出的高度（M1 验收 P9）
  const geo = await page.evaluate(sel => {
    const a = document.querySelector(sel).getBoundingClientRect();
    const rel = e => { const r = e.getBoundingClientRect(); return { x: r.left - a.left, y: r.top - a.top, width: r.width, height: r.height }; };
    const panes = [...document.querySelectorAll(`${sel} [data-markdown-copy="code-block"] *`)]
      .filter(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)
      .map(e => ({ ...rel(e), extra: e.scrollHeight - e.clientHeight }));
    return { media: rel(document.getElementById('media')), wide: rel(document.getElementById('wide')), panes };
  }, ANSWER);
  await page.locator(`${ANSWER} clipper-ribbon button`).click();
  await page.locator('clipper-dock .card.ok, clipper-dock .card.bad').waitFor({ timeout: 30_000 });
  const card = await page.locator('clipper-dock .card').innerText();

  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  let items = [];
  for (let i = 0; i < 50; i++) {
    items = await sw.evaluate(() => chrome.downloads.search({}));
    if (items.length >= 1 && items.every(d => d.state === 'complete')) break;
    await new Promise(r => setTimeout(r, 200));
  }
  // 没选文件夹时只下载长图：笔记从测试文件夹里读——设好再收藏一次，读完清掉文件夹和收藏记录，不影响后面的用例
  await setVault(sw);
  await page.locator(`${ANSWER} clipper-ribbon button`).click();
  await page.locator('clipper-dock .card.ok, clipper-dock .card.bad').nth(1).waitFor({ timeout: 30_000 });
  const note = await sw.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    let text = '';
    for await (const [, h] of root.entries())
      for await (const [f, fh] of h.entries()) if (f.endsWith('.md')) text = await (await fh.getFile()).text();
    for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('chatgpt-clipper', 1);
      open.onsuccess = () => { const tx = open.result.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = resolve; tx.onerror = reject; };
      open.onerror = reject;
    });
    return text;
  });
  await page.locator('clipper-dock .card').evaluateAll(cs => cs.forEach(c => c.remove()));
  result = { box, baseline, card, items, ribbon, clip, geo, note };
});

/** 测试里弹不出选目录窗口：用扩展自己的私有存储区（OPFS）目录代替 Vault，按设置页的存法放进 IndexedDB */
// 点丝带收藏，等新出现的进度卡收尾。旧卡片 8 秒后自动关，按张数找新卡片会对不上（收藏一慢就超时）：先给旧卡片打记号，新卡片打上编号返回
let cardNo = 0;
async function collectCard(pg, ribbon) {
  await pg.locator('clipper-dock .card').evaluateAll(cs => cs.forEach(c => c.setAttribute('data-old', '')));
  await pg.locator(ribbon).click();
  const card = pg.locator('clipper-dock .card.ok:not([data-old]), clipper-dock .card.bad:not([data-old])').first();
  await card.waitFor({ timeout: 30_000 });
  const no = String(++cardNo);
  await card.evaluate((c, no) => c.setAttribute('data-no', no), no);
  return pg.locator(`clipper-dock .card[data-no="${no}"]`);
}

async function setVault(sw) {
  await sw.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('chatgpt-clipper', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onsuccess = () => { const tx = open.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(dir, 'vaultDir'); tx.oncomplete = resolve; tx.onerror = reject; };
      open.onerror = reject;
    });
  });
}

after(async () => {
  await ctx?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** 剪贴板里的内容：有图片返回 PNG 的 [宽, 高]，否则返回文字 */
const clipboard = pg => pg.evaluate(async () => {
  for (const item of await navigator.clipboard.read()) {
    if (item.types.includes('image/png')) { const v = new DataView(await (await item.getType('image/png')).arrayBuffer()); return [v.getUint32(16), v.getUint32(20)]; }
    if (item.types.includes('text/plain')) return (await item.getType('text/plain')).text();
  }
  return null;
});

// Playwright 把下载的文件改成随机名，按数据类型找
const file = type => fs.readFileSync(result.items.find(d => d.url.startsWith(`data:${type}`)).filename);
const png = () => file('image/png');
const md = () => result.note;

test('没选 Vault 文件夹（比如没装 Obsidian）：只把长图下载到 Chrome，最后一步标「无 Obsidian」，给「去设置」', () => {
  assert.match(result.card, /入库\s+无 Obsidian/);
  assert.match(result.card, /^无法保存，长图已下载\n/);
  assert.match(result.card, /⬇️\s+一、目标与范围\n无 Obsidian，长图已下载到 Chrome\n去设置\n📄 导出 PDF\n默认存储地址为「下载」$/, '没有 Obsidian 也能导出 PDF');
  assert.doesNotMatch(result.card, /不完整/);
  assert.equal(result.items.length, 1);
  assert.equal(png().subarray(1, 4).toString(), 'PNG');
});

test('选了文件夹就写进去；同一条再收藏就覆盖；刷新后丝带显示已收藏；原文件夹被挪走就只提示', async () => {
  const sw = ctx.serviceWorkers()[0];
  await setVault(sw);
  const tree = () => sw.evaluate(async () => {
    const out = {};
    for await (const [name, h] of (await navigator.storage.getDirectory()).entries()) {
      if (h.kind !== 'directory') continue;
      out[name] = {};
      for await (const [f, fh] of h.entries()) out[name][f] = (await fh.getFile()).size;
    }
    return out;
  });
  const collect = async () => (await collectCard(page, `${ANSWER} clipper-ribbon button`)).innerText();

  const first = await collect();
  let t = await tree(), names = Object.keys(t);
  assert.equal(names.length, 1, JSON.stringify(t));
  assert.match(names[0], /^\d{4}-\d{2}-\d{2} 一、目标与范围$/);
  assert.equal(t[names[0]]['answer.png'], png().length);
  assert.equal(t[names[0]]['一、目标与范围.md'], Buffer.byteLength(md()));
  assert.match(first, /^已收藏\n/);
  assert.match(first, /入库\s+已存入/);
  assert.match(first, /📁\s+一、目标与范围\n\d{4}-\d{2}-\d{2}\n📄 导出 PDF\n默认存储地址为「下载」$/);

  const again = await collect();
  assert.match(again, /^已更新\n/);
  assert.deepEqual(Object.keys(await tree()), names, '同一条回答不该新建文件夹');

  // 真实页面上回答内容会晚于丝带渲染出来：刷新时先把回答清空，1.5 秒后再放回去
  await page.addInitScript(sel => document.addEventListener('DOMContentLoaded', () => {
    const el = document.querySelector(sel), kids = [...el.childNodes];
    el.replaceChildren();
    setTimeout(() => el.append(...kids), 1500);
  }), ANSWER);
  await page.reload();
  await page.locator(`${ANSWER} clipper-ribbon button.rib.done`).waitFor({ timeout: 5_000 });

  await sw.evaluate(async n => (await navigator.storage.getDirectory()).removeEntry(n, { recursive: true }), names[0]);
  const moved = await collect();
  assert.match(moved, /^已收藏过\n[\s\S]*这次没有重写/);
  assert.deepEqual(await tree(), {}, '原文件夹挪走后不该再写');
  assert.equal((await sw.evaluate(() => chrome.downloads.search({}))).length, 1, '写进 Vault 时不该再下载');
});

test('标题变了（如命名规则调整）：只有插件写的文件就改成新名字；有用户自己的文件就原地覆盖、不改名', async () => {
  const sw = ctx.serviceWorkers()[0];
  // 把这条回答的收藏记录改成早期格式（只存文件夹名），并按旧的截断名字建好文件夹
  const legacy = (folder, extra) => sw.evaluate(async ([folder, extra]) => {
    const root = await navigator.storage.getDirectory();
    for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
    const sub = await root.getDirectoryHandle(folder, { create: true });
    for (const f of ['answer.png', ...extra]) { const w = await (await sub.getFileHandle(f, { create: true })).createWritable(); await w.write('旧'); await w.close(); }
    const db = await new Promise(r => { const o = indexedDB.open('chatgpt-clipper', 1); o.onsuccess = () => r(o.result); });
    const store = db.transaction('kv', 'readwrite').objectStore('kv');
    const keys = await new Promise(r => { const q = store.getAllKeys(); q.onsuccess = () => r(q.result); });
    const key = keys.find(k => String(k).startsWith('saved:'));
    await new Promise(r => { const q = store.put(folder, key); q.onsuccess = r; });
    return key;
  }, [folder, extra]);
  const tree = () => sw.evaluate(async () => {
    const out = {};
    for await (const [name, h] of (await navigator.storage.getDirectory()).entries()) {
      out[name] = [];
      for await (const [f] of h.entries()) out[name].push(f);
      out[name].sort();
    }
    return out;
  });
  const collect = async () => (await collectCard(page, `${ANSWER} clipper-ribbon button`)).innerText();

  assert.ok(await legacy('2026-10-01 一、目标', ['一、目标.md']));
  assert.match(await collect(), /入库\s+已更新/);
  assert.deepEqual(await tree(), { '2026-10-01 一、目标与范围': ['answer.png', '一、目标与范围.md'] }, '应改成新名字、沿用原日期、删掉旧文件夹');

  await legacy('2026-10-01 一、目', ['一、目.md', '我的批注.md']);
  await collect();
  assert.deepEqual(await tree(), { '2026-10-01 一、目': ['answer.png', '一、目.md', '一、目标与范围.md', '我的批注.md'] }, '有用户自己的文件时不改名、不删');
});

test('丝带落在回答左侧空白里，不被外层裁剪容器裁掉', () => {
  const { ribbon, clip, box } = result;
  // overflow-x: clip 按内边距盒裁剪，边界就是容器的左边
  assert.ok(ribbon.x >= clip.x, `丝带左边 ${ribbon.x} 超出了裁剪容器左边 ${clip.x}`);
  assert.ok(ribbon.x + ribbon.width <= box.x, '丝带压到了回答正文');
  assert.ok(ribbon.width >= 12 && ribbon.height >= 40, '丝带太小');
});

test('进度卡里的回答标题取看得见的第一个标题，跳过读屏专用的隐藏标题', () => {
  assert.match(result.card, /\n一、目标与范围\n/);
  assert.doesNotMatch(result.card, /ChatGPT 说/);
});

test('收藏一整条回答：长图同时放进剪贴板，进度卡 PNG 一步写「已复制」（FR-14）', async () => {
  assert.match(result.card, /PNG 文件\n\d+px · 已复制\n/, result.card);
  const buf = png();
  assert.deepEqual(await clipboard(page), [buf.readUInt32BE(16), buf.readUInt32BE(20)]);
});

test('PNG 宽度与回答一致，高度 = 回答高度 + 代码框展开多出的高度（≥4000px 长图，M1 验收 P9）', () => {
  const buf = png();
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const extra = result.geo.panes.reduce((n, p) => n + p.extra, 0);
  assert.ok(extra > 1000, `测试页的长代码框只多出 ${extra}px`);
  assert.equal(w, Math.round(result.box.width));
  assert.ok(Math.abs(h - (result.box.height + extra)) <= 2, `长图高 ${h}，应为 ${result.box.height} + ${extra}`);
  assert.ok(h >= 4000, `测试页回答只有 ${h}px`);
});
/** 两张 PNG 逐像素比，rect 只比回答里的这一块（相对回答左上角），dyA：这一块在 a 里往下挪了多少（代码框展开）；返回不同像素占比 */
async function pixelDiff(a, b, rect, dyA = 0) {
  const p = await ctx.newPage();
  const stat = await p.evaluate(async ([a, b, tol, rect, dyA]) => {
    const load = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const [x, y] = await Promise.all([load(a), load(b)]);
    const r = rect ?? { x: 0, y: 0, width: Math.min(x.width, y.width), height: Math.min(x.height, y.height) };
    const w = Math.round(r.width), h = Math.round(r.height);
    const px = (img, dy) => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, -Math.round(r.x), -Math.round(r.y + dy)); return g.getImageData(0, 0, w, h).data; };
    const da = px(x, dyA), db = px(y, 0);
    let diff = 0;
    for (let i = 0; i < da.length; i += 4)
      if (Math.abs(da[i] - db[i]) > tol || Math.abs(da[i + 1] - db[i + 1]) > tol || Math.abs(da[i + 2] - db[i + 2]) > tol) diff++;
    return { ratio: diff / (w * h), sizes: [x.width, x.height, y.width, y.height] };
  }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`, PIXEL_TOL, rect, dyA]);
  await p.close();
  return stat;
}

test('PNG 与浏览器真实渲染逐像素比，只差抗锯齿（比到第一个展开的代码框为止）', async () => {
  const stat = await pixelDiff(png(), result.baseline, { x: 0, y: 0, width: result.box.width, height: Math.min(...result.geo.panes.map(p => p.y)) });
  console.log(`  差异像素 ${(stat.ratio * 100).toFixed(2)}%，尺寸 ${stat.sizes.join('×')}`);
  assert.ok(stat.ratio < MAX_DIFF_RATIO, `差异像素 ${(stat.ratio * 100).toFixed(2)}% 超过 ${MAX_DIFF_RATIO * 100}%`);
});

test('长图里有跨域图片、网页字体、脚本画的 canvas（M1 验收 P4、P5、P10）', async () => {
  const { media, panes } = result.geo;
  const stat = await pixelDiff(png(), result.baseline, media, panes.filter(p => p.y < media.y).reduce((n, p) => n + p.extra, 0));
  console.log(`  第十节差异像素 ${(stat.ratio * 100).toFixed(2)}%`);
  assert.ok(stat.ratio < MAX_DIFF_RATIO, `第十节差异像素 ${(stat.ratio * 100).toFixed(2)}% 超过 ${MAX_DIFF_RATIO * 100}%：图片、字体或 canvas 没进长图`);
});

test('长图里代码框展开：120 行都画出来，可横向滚动的块不画滚动条（M1 验收 P9、P15）', async () => {
  const pane = result.geo.panes.find(p => p.extra > 1000), { wide } = result.geo;
  const p = await ctx.newPage();
  // 展开后的代码框里每 20px 一行，每行左边都该有深色的字
  const lines = await p.evaluate(async ([src, pane]) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
    let n = 0;
    for (let i = 0; i < 120; i++) {
      const d = g.getImageData(Math.round(pane.x), Math.round(pane.y) + i * 20, 200, 20).data;
      for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] < 300) { n++; break; }
    }
    return n;
  }, [`data:image/png;base64,${png().toString('base64')}`, pane]);
  await p.close();
  assert.equal(lines, 120, `长图里代码框只画出 ${lines} 行`);
  const stat = await pixelDiff(png(), result.baseline, wide);
  console.log(`  宽块差异像素 ${(stat.ratio * 100).toFixed(2)}%`);
  assert.ok(stat.ratio < MAX_DIFF_RATIO, `宽块差异像素 ${(stat.ratio * 100).toFixed(2)}%：长图里多画了滚动条`);
});

test('笔记：frontmatter、折叠的提问、嵌入长图', () => {
  const m = md();
  assert.match(m, /^---\nsource: chatgpt\nurl: https:\/\/chatgpt\.com\/c\/fixture#clip-[0-9a-f]{10}\ncaptured: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\ntitle: "一、目标与范围"\ntags: \[chatgpt收藏\]\n---\n\n\[↩ 打开原回答\]\(https:\/\/chatgpt\.com\/c\/fixture#clip-[0-9a-f]{10}\)\n\n> \[!question\]/);
  assert.match(m, /\n> \[!question\]- 提问\n> 帮我设计一个小团队的周度工作节奏\n\n!\[\[answer\.png\]\]\n\n## 一、目标与范围\n/);
});

test('正文：标题、卡片、列表、表格、代码、公式、链接、文档块按 Markdown 结构输出', () => {
  const m = md();
  const has = s => assert.ok(m.includes(s), `笔记里缺少：\n${s}`);
  has('## 八、下一步');
  has('- **要点 1.1**\n  - 第 1 条说明：保持简单，写清楚谁在什么时候做什么，结果放在哪里。\n- **要点 1.2**');
  has('| 事项 | 负责人 | 状态 | 优先级 |\n| --- | --- | --- | --- |\n| 事项 1 | 负责人 甲 | 已完成 |  |');
  has('- 第 1 步：**先确认输入**，再动手；遇到阻塞当天同步。');
  has('```\n周一 09:30  计划会（30 分钟）\n周三 16:00  中途对齐（15 分钟）\n周五 17:00  复盘（30 分钟）\n```');
  has('[一个外部链接](https://example.com/doc)和`行内代码`');
  // 卡片里的小标题（只有一段加粗字的段落）：后面的段落缩进到它下面，直到下一个小标题（M1 验收 P1，真实页面实测结构）
  has('- **示例卡片**\n  - 卡片开头的说明。\n  - **1. 小标题甲**\n    - 甲的正文。\n  - **2. 小标题乙**\n    - 乙的正文第一段。\n    - 乙的正文第二段。\n    - **内部已知**\n      - 乙下面的小卡片。\n');
  // 文件卡片（S3 真实结构）：开头的「图标 + 标题 + 说明」当卡片标题；同一行右侧的短标签放括号里；整行只有按钮的不要
  has('- **模板包 · 第一版**\n  - 示例技能 · 2 个文件\n  - 配置草案\n  - **SKILL.md**（主文件）\n    - 角色与规则\n  - **README.md**\n    - 接入说明\n\n');
  has('- **流程起点**\n  - 识别场景与目标\n  - **子步骤**\n    - 拆成三件事');
  // 流程图外框没有自己的标题：各步平铺，不缩进到第一步下面
  has('- 拆成三件事\n\n- **流程第一步**\n  - 第一步的说明\n\n- **流程第二步**\n  - 第二步的说明\n\n- **分支甲**\n  - 甲的说明\n- **分支乙**\n  - 乙的说明\n\n- **流程收尾**\n  - 收尾的说明\n\n');
  has('1. 甲项：先对齐目标\n2. 乙项：再排优先级');
  has('- 外层一\n  - 内层 A\n  - 内层 B，*斜体*和~~删除线~~\n- 外层二');
  has('| 字段 | 说明 |\n| --- | --- |\n| 第一段<br>第二段 | 含 a\\|b 竖线 |');
  has('```python\ndef hello():\n    return "hi"\n```');
  // 真实页面的代码块：可运行的用代码编辑器一行一个 div，语言在 data-language；只读的是 pre，语言只写在块头（M1 验收 P7、P8）
  // 代码里连续的空行原样保留，不跟正文一起合并（M1 验收 T6）
  has('```python\ndef quick_sort(arr):\n    # 递归终止条件\n    if len(arr) <= 1:\n\n        return arr\n\n\n# 测试示例\n```');
  has('```bash\n# 统计文件数\nfind . -maxdepth 1 -type f | wc -l\n\n\nfind . -type f | wc -l\n```');
  // 长代码：编辑器只渲染看得见附近的行，转 MD 前要把代码框滚一遍读全，占位块不算一行（M1 验收 P13）
  has(`\`\`\`python\n${Array.from({ length: 120 }, (_, i) => `x${i + 1} = ${i + 1}  # 第 ${i + 1} 行`).join('\n')}\n\`\`\``);
  has('质能公式 $E = mc^2$ 是行内公式。');
  has('$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$');
  // 交互公式卡片：主公式写成独立公式，下面是示例结果；滑块不要（M1 验收 P10）
  has('$$\nx = \\frac{-b}{2a}\n$$\n\n$\\Delta=16>0$\n\n两个实数根\n\n');
  // 链接后的来源胶囊：站名放括号里，小图标不要（P11）
  has('官方文档在这里。（示例站点）');
  has('> 引用的一句话。');
  has('详见 周报模板.xlsx，按模板填写。');
  has('---\n\n# 周报模板\n\n- 本周完成\n- 下周计划');
  for (const bad of ['ChatGPT 说：', '打开文件', '复制代码', '文档\n', 'E=mc²', '⧉', '简短一点', '简版', '提供反馈', '1.0', 'favicons', '下载模板包', '- - '])
    assert.ok(!m.includes(bad), `笔记里不该有：${bad}`);
});

test('正文：回答里看得见的文字全部保留（FR-4）', async () => {
  const m = md().replace(/\\\|/g, '|').replace(/\s+/g, ' ');   // 表格里的竖线转义过
  // 独立于转换代码取可见文字：跳过插件节点、读屏标题、公式渲染层（笔记里放源码）、文档块头、按钮、ChatGPT 复制时排除的元素
  const texts = await page.locator(ANSWER).evaluate(el => {
    const out = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const p = n.parentElement, t = n.textContent.replace(/\s+/g, ' ').trim();
      // 例外：整行只有按钮的文件卡片底栏（行内的 pressable）不进笔记
      if (!t || p.closest('clipper-ribbon, [data-conversation-role], .katex, [data-client-defined-widget] header, button, [data-markdown-copy="exclude"], [data-d-component="row"] [data-d-component="pressable"]')) continue;
      if (!p.checkVisibility({ visibilityProperty: true })) continue;
      out.push(t);
    }
    return out;
  });
  assert.ok(texts.length > 100, `只取到 ${texts.length} 段文字`);
  const missing = texts.filter(t => !m.includes(t));
  assert.deepEqual(missing, []);
});

test('回答没有标题时用提问当标题，最多 30 字（M1 验收 P12）', async () => {
  const card = await (await collectCard(page, '[data-chatgpt-search-unit-key="fallback-turn-4:1:assistant"] clipper-ribbon button')).innerText();
  assert.match(card, /\n简短一点\n/);
  assert.doesNotMatch(card, /简版：/);
});

// Claude 网页版（M2）：tests/fixtures/claude-answer.html 照真实页面结构仿的一轮问答
describe('Claude 网页版', () => {
  const MSG = '[data-testid="assistant-message"]';
  const NOISE = '[data-cds="TurnStatus"], :has(> [data-testid="message-actions"])';
  let cp, c;

  before(async () => {
    const sw = ctx.serviceWorkers()[0];
    // 前面 ChatGPT 的用例会在测试文件夹里留下收藏，先清空
    await sw.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
    });
    await setVault(sw);
    cp = await ctx.newPage();
    await cp.goto(CLAUDE_URL);
    await cp.locator(`${MSG} clipper-ribbon`).waitFor({ state: 'attached' });
    await cp.evaluate(() => document.fonts.ready);
    // 基准：浏览器里把思考过程行、按钮行藏起来后的回答
    await cp.addStyleTag({ content: `${NOISE}{display:none!important}`, });
    const box = await cp.locator(MSG).boundingBox();
    const baseline = await cp.locator(MSG).screenshot();
    await cp.evaluate(() => document.querySelector('style:last-of-type').remove());
    const full = await cp.locator(MSG).boundingBox();
    await cp.locator(`${MSG} clipper-ribbon button`).click();
    await cp.locator('clipper-dock .card.ok, clipper-dock .card.bad').waitFor({ timeout: 30_000 });
    const card = await cp.locator('clipper-dock .card').innerText();
    const files = await sw.evaluate(async () => {
      const out = {};
      for await (const [, h] of (await navigator.storage.getDirectory()).entries())
        for await (const [f, fh] of h.entries()) {
          const file = await fh.getFile();
          out[f.endsWith('.md') ? 'note' : f] = f.endsWith('.md') ? await file.text() : [...new Uint8Array(await file.arrayBuffer())];
        }
      return out;
    });
    c = { box, full, baseline, card, note: files.note, png: Buffer.from(files['answer.png'] ?? []) };
  });

  test('丝带挂在 Claude 的回答上，收藏后写进 Vault', () => {
    assert.match(c.card, /^已收藏\n/, c.card);
    assert.match(c.card, /📁\s+快速排序示例\n/);
  });

  test('长图不画思考过程行和按钮行：宽同回答，高 = 去掉它们之后的回答高度', () => {
    const w = c.png.readUInt32BE(16), h = c.png.readUInt32BE(20);
    assert.equal(w, Math.round(c.box.width));
    assert.ok(c.full.height - c.box.height > 50, '测试页里思考过程行和按钮行该占位置');
    assert.ok(Math.abs(h - c.box.height) <= 1, `长图高 ${h}，应为 ${c.box.height}（原回答 ${c.full.height}）`);
  });

  test('长图与浏览器真实渲染逐像素比，只差抗锯齿（Artifact 卡片、代码、公式、表格都在）', async () => {
    const { ratio, sizes } = await pixelDiff(c.png, c.baseline);
    assert.ok(ratio < MAX_DIFF_RATIO, `不同像素占 ${(ratio * 100).toFixed(2)}%，尺寸 ${sizes}`);
  });

  test('笔记：来源 claude，提问取自用户消息，正文按 Markdown 结构输出', () => {
    const n = c.note;
    assert.match(n, /^---\nsource: claude\nurl: https:\/\/claude\.ai\/chat\/fixture#clip-[0-9a-f]{10}\n/);
    assert.match(n, /\ntags: \[claude收藏\]\n/);
    assert.match(n, /> \[!question\]- 提问\n> 用 Python 写一个快速排序，再给一张表和公式。\n/);
    assert.match(n, /\n## 快速排序示例\n/);
    assert.match(n, /\n\*\*Artifact：番茄钟\*\*（内容在原对话里）\n/);
    assert.match(n, /下面是\*\*带注释\*\*的版本，调用 `quick_sort\(data\)` 即可，详见 \[Python 文档\]\(https:\/\/docs\.python\.org\/3\/\)。/);
    assert.match(n, /\n```python\ndef quick_sort\(a\):\n    # 少于两个元素就已经有序\n[\s\S]*?\+ quick_sort\(\[x for x in rest if x >= pivot\]\)\n```\n/);
    assert.match(n, /判别式 \$\\Delta = b\^2-4ac\$ 决定根的个数：/);
    assert.match(n, /\n\$\$\nx=\\frac\{-b\\pm\\sqrt\{\\Delta\}\}\{2a\}\n\$\$\n/);
    assert.match(n, /\n\| 大于 0 \| 两个不等实根 \| — \|\n/);
    assert.match(n, /\n1\. \*\*排序\*\*：先分区再递归。\n2\. 复杂度平均 O\(n log n\)。\n?$/);
  });

  test('笔记不收思考过程、按钮、时间、读屏标题、代码块的语言名和 Artifact 的分享按钮', () => {
    for (const s of ['正在为零基础用户', 'just now', '重试', 'Claude responded', 'You said', '分享', 'Only you', '复制'])
      assert.ok(!c.note.includes(s), `笔记里不该有「${s}」`);
    assert.doesNotMatch(c.note, /^python$/m);
  });

  test('对话行被卸载再装回（Claude 只渲染屏幕附近的行）、底部时间变了：丝带重新挂上，仍认得是收藏过的', async () => {
    await cp.evaluate(sel => {
      const row = document.querySelector(sel).closest('[data-testid="transcript-row"]'), parent = row.parentElement;
      row.remove();
      const again = row.cloneNode(true);
      again.querySelector('clipper-ribbon')?.remove();
      again.querySelector('time').textContent = '5 minutes ago';
      setTimeout(() => parent.append(again), 200);
    }, MSG);
    await cp.locator(`${MSG} clipper-ribbon button.rib.done`).waitFor({ timeout: 5_000 });
  });

  test('「为什么存」已删（FR-8，2026-11-10）：卡片上没有输入框；旧笔记里写过的 why，再收藏同一条时不再保留', async () => {
    const sw = ctx.serviceWorkers()[0];
    const note = () => sw.evaluate(async () => {
      for await (const [, h] of (await navigator.storage.getDirectory()).entries())
        for await (const [f, fh] of h.entries()) if (f.endsWith('.md')) return (await fh.getFile()).text();
    });
    const collect = () => collectCard(cp, `${MSG} clipper-ribbon button`);
    let card = await collect();
    assert.equal(await card.locator('input, .why, .said').count(), 0, '卡片上不该再有「为什么存」');
    // 模拟删功能之前写过一句的旧笔记
    await sw.evaluate(async () => {
      for await (const [, h] of (await navigator.storage.getDirectory()).entries())
        for await (const [f, fh] of h.entries()) if (f.endsWith('.md')) {
          const t = (await (await fh.getFile()).text()).replace(/^(title: .*)$/m, '$1\nwhy: "旧的一句"').replace(/\n---\n/, '\n---\n\n> [!note] 为什么存\n> 旧的一句\n');
          const w = await fh.createWritable(); await w.write(t); await w.close();
        }
    });
    assert.match(await note(), /why: "旧的一句"/);
    card = await collect();
    assert.equal(await card.locator('input, .why, .said').count(), 0);
    const n = await note();
    assert.doesNotMatch(n, /why:|为什么存/);
    assert.match(n, /\n---\n\n\[↩ 打开原回答\]\(.+\)\n\n> \[!question\]- 提问\n/);
  });

  test('改版自检：笔记读到的字不到页面一半、长图不到页面一半高，照样存下、标黄，笔记标 incomplete', async () => {
    const sw = ctx.serviceWorkers()[0];
    const notes = () => sw.evaluate(async () => {
      const out = [];
      for await (const [, h] of (await navigator.storage.getDirectory()).entries())
        for await (const [f, fh] of h.entries()) if (f.endsWith('.md')) out.push(await (await fh.getFile()).text());
      return out;
    });
    const collect = () => collectCard(cp, `${MSG} clipper-ribbon button`);
    // 原样还原用：去掉丝带（还原后由插件重新挂）
    const html = await cp.locator(MSG).evaluate(el => { const c = el.cloneNode(true); c.querySelector('clipper-ribbon')?.remove(); return c.innerHTML; });

    // 正文被包进一层笔记会跳过的块（代码块语言名的标记）：页面上看得见，笔记里没有
    await cp.locator(`${MSG} .standard-markdown`).evaluate(md => {
      const g = document.createElement('div'), skip = document.createElement('div');
      g.setAttribute('role', 'group');
      skip.setAttribute('data-find-omitted', '');
      md.replaceWith(g);
      g.append(skip);
      skip.append(md);
    });
    let card = await collect(), text = await card.innerText();
    assert.match(text, /^已收藏，但可能不完整\n/, text);
    assert.equal(await card.locator('li.warn').innerText(), '!\nMD 文件\n' + text.match(/(\d+ 字)/)[1]);
    assert.match(await card.locator('.loc.warn').innerText(), /^⚠️\s+笔记只读到页面文字的 \d+%\n页面可能改版了，能存的部分已存好$/);
    let n = (await notes()).find(t => t.includes('incomplete'));
    assert.match(n, /\ntags: \[claude收藏\]\nincomplete: true\n---\n\n> \[!warning\] 可能不完整\n> 笔记只读到页面文字的 \d+%，页面可能改版了。\n\n\[↩ 打开原回答\]\(.+\)\n\n> \[!question\]- 提问\n/);

    // 正文被认成要去掉的界面行（按钮行）：长图只剩 Artifact 卡片那一条
    await cp.locator(MSG).evaluate((el, html) => { el.innerHTML = html; }, html);
    await cp.locator(`${MSG} [data-transcript-engine-root]`).evaluate(r => r.insertAdjacentHTML('beforeend', '<div data-testid="message-actions"></div>'));
    await cp.locator(`${MSG} clipper-ribbon`).waitFor({ state: 'attached' });
    card = await collect();
    text = await card.innerText();
    assert.match(text, /^已收藏，但可能不完整\n/, text);
    assert.equal(await card.locator('li.warn', { hasText: 'PNG 文件' }).count(), 1);
    assert.match(await card.locator('.loc.warn').innerText(), /长图只有页面高度的 \d+%/);
    await cp.locator(MSG).evaluate((el, html) => { el.innerHTML = html; }, html);
  });

  test('跳回原回答：笔记链接带编号；长对话里回答没渲染时往上翻着找，找到后滚过去闪黄光；找不到就提示', async () => {
    const hash = c.note.match(/^url: .*(#clip-[0-9a-f]{10})$/m)[1];
    assert.ok(c.note.includes(`[↩ 打开原回答](${CLAUDE_URL}${hash})`));
    const p = await ctx.newPage();
    // 模拟 Claude 只渲染屏幕附近的行：底下垫一段长内容和后面的另一条回答、先滚到底，滚到靠上之前要找的那一行不在页面里
    await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const sc = document.querySelector('.scroller'), row = document.querySelector('[data-index="1"]'), parent = row.parentElement;
      const later = row.cloneNode(true);
      later.dataset.index = '9';
      later.querySelector('.standard-markdown').textContent = '后面的另一条回答';
      parent.insertAdjacentHTML('beforeend', '<div style="height:4000px"></div>');
      parent.append(later);
      row.remove();
      sc.scrollTop = sc.scrollHeight;
      sc.addEventListener('scroll', () => { if (sc.scrollTop < 300 && !row.isConnected) parent.insertBefore(row, parent.children[1]); });
    }));
    await p.goto(CLAUDE_URL + hash);
    await p.locator(`[data-index="1"] ${MSG} clipper-flash`).waitFor({ state: 'attached', timeout: 10_000 });
    const r = await p.locator(`[data-index="1"] ${MSG}`).evaluate(el => { const b = el.getBoundingClientRect(); return { top: b.top, h: innerHeight }; });
    assert.ok(r.top >= 0 && r.top < 200, `应滚到回答开头：${JSON.stringify(r)}`);
    await p.locator('clipper-flash').waitFor({ state: 'detached', timeout: 5_000 });
    await p.close();

    const miss = await ctx.newPage();
    await miss.goto(CLAUDE_URL + '#clip-0000000000');
    await miss.locator('clipper-dock .toast').waitFor({ timeout: 8_000 });
    assert.match(await miss.locator('clipper-dock .toast').innerText(), /没找到收藏的那条回答/);
    await miss.close();
  });

  test('点进度卡绿块在 Obsidian 里打开：没设置位置时悬停提示并打开设置页；设置后打开 obsidian:// 链接', async () => {
    const sw = ctx.serviceWorkers()[0];
    const kv = (op, v) => sw.evaluate(([op, v]) => new Promise((resolve, reject) => {
      const o = indexedDB.open('chatgpt-clipper', 1);
      o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'), st = tx.objectStore('kv'); op === 'put' ? st.put(v, 'obsidianPath') : st.delete('obsidianPath'); tx.oncomplete = resolve; tx.onerror = reject; };
    }), [op, v]);
    // 先给已有的卡片打记号再收藏：旧卡片会 8 秒后自动关，按个数找新卡片会对不上
    const collect = async () => {
      await cp.locator('clipper-dock .card').evaluateAll(cs => cs.forEach(c => c.setAttribute('data-old', '')));
      await cp.locator(`${MSG} clipper-ribbon button`).click();
      const card = cp.locator('clipper-dock .card:not([data-old])').filter({ has: cp.locator('.loc') });
      await card.waitFor({ timeout: 30_000 });
      return card.locator('.loc');
    };

    let loc = await collect();
    assert.match(await loc.innerText(), /^📁\s+快速排序示例\n\d{4}-\d{2}-\d{2}$/, '平时和以前一样');
    await loc.hover();
    assert.match(await loc.innerText(), /设置 Obsidian 位置后可直接打开 ↗$/);
    const [opt] = await Promise.all([ctx.waitForEvent('page'), loc.click()]);
    await opt.waitForLoadState();
    assert.match(opt.url(), /^chrome-extension:\/\/.+\/options\.html$/);
    await opt.close();

    await kv('put', 'Obsidian Vault/00 待整理/ChatGPT收藏');
    loc = await collect();
    await loc.hover();
    assert.match(await loc.innerText(), /在 Obsidian 里打开 ↗$/);
    // 无界面的浏览器不会真的去打开 Obsidian，这里核对块上记的链接
    const href = await loc.getAttribute('data-href');
    assert.match(href, /^obsidian:\/\/open\?vault=Obsidian%20Vault&file=/);
    assert.match(decodeURIComponent(href.split('&file=')[1]), /^00 待整理\/ChatGPT收藏\/\d{4}-\d{2}-\d{2} 快速排序示例\/快速排序示例$/);
    await loc.click();
    await kv('delete');
  });

  test('Claude Code 的会话页（claude.ai/code/…）不挂丝带；同样的页面放在对话页就挂', async () => {
    const pg = await ctx.newPage();
    await pg.goto(CLAUDE_CODE_URL);
    await pg.waitForTimeout(1500);   // 插件每次页面变化后 300ms 扫一遍
    assert.equal(await pg.locator('clipper-ribbon').count(), 0, 'Claude Code 会话页不该有丝带');
    assert.equal(await cp.locator(`${MSG} clipper-ribbon`).count(), 1, '对话页照常有丝带');
    await pg.close();
  });

  test('改版自检：有两问以上、却一条回答都没认出来，页面静止 10 秒才提醒一次，提醒上能复制修复请求，之后认出回答就自动收起；页面还在加载、还在变、第一问还在生成、正常页面都不提醒', async () => {
    const [broken, slow, thinking, growing, ticking] = await Promise.all([BROKEN_URL, CLAUDE_SLOW_URL, CLAUDE_THINKING_URL, GROWING_URL, TICKING_URL].map(async u => {
      const pg = await ctx.newPage();
      await pg.goto(u);
      return pg;
    }));
    assert.equal(await thinking.locator('[data-testid="user-message"]').count(), 1);
    await new Promise(r => setTimeout(r, 12_500));
    const toast = broken.locator('clipper-dock .toast');
    assert.equal(await toast.count(), 1);
    assert.match(await toast.innerText(), /^!\nChatGPT 改版了，收藏暂时用不了\n页面上有 2 个提问，插件一条回答都没认出来，页面也没在生成或加载。这要改插件代码：复制修复请求，粘贴给 Claude。\n复制修复请求\n✕$/);
    assert.equal(await slow.locator('clipper-dock .toast').count(), 0, '页面还在加载（对话还没出来）不该提醒');
    await slow.locator('clipper-ribbon').first().waitFor({ state: 'attached', timeout: 3_000 });
    assert.equal(await thinking.locator('clipper-dock .toast').count(), 0, '只有一问、回答还没出来（还在生成）不该提醒');
    assert.equal(await cp.locator('clipper-dock .toast').count(), 0, '正常页面不该提醒');
    assert.equal(await growing.locator('clipper-dock .toast').count(), 0, '页面还在加节点（流式输出）不该提醒');
    assert.equal(await ticking.locator('clipper-dock .toast').count(), 0, '页面文字还在变（思考计时）不该提醒');
    // 复制修复请求：选择器命中数和页面结构，不带对话文字
    await toast.locator('.acts button').click();
    await toast.getByText('✓ 已复制。到 Claude Code 里 chatgpt-clipper 项目的会话粘贴发送。').waitFor({ timeout: 2_000 });
    const req = await clipboard(broken);
    assert.match(req, /^chatgpt-clipper 认不出 ChatGPT 的回答了，请重新侦察对话页（docs\/recon\/），改 src\/lib\/adapter\.ts。\n- 时间：\d{4}-\d\d-\d\d \d\d:\d\d（北京时间）\n- 页面：chatgpt\.com 对话页，插件版本 \d+\.\d+\.\d+\n/, req);
    assert.match(req, /回答选择器 \[data-chatgpt-search-unit-key\$=":assistant"\], \[data-response-body\]\[data-chatgpt-search-message-ids\]:not\(\[data-chatgpt-search-unit-key\$=":assistant"\] \*\)：0 个\n- 提问选择器 \[data-chatgpt-search-unit-key\$=":user"\]：2 个/, req);
    assert.match(req, /data-chatgpt-search-unit-key ×4/, req);
    assert.match(req, /界面标记：.*data-chatgpt-search-unit-key="fallback-turn-N:N:assistant-x"/, '改掉的回答标记要写进修复请求');
    for (const s of ['周度工作节奏', '简短一点', '周一计划', 'fixture', 'broken']) assert.ok(!req.includes(s), `修复请求里不该有对话内容或对话编号：${s}`);
    // 页面停下来以后照常提醒：最后一次变化在第 14 秒。加节点的页面每次变化都重新计时，约第 24 秒提醒；
    // 只改文字的页面到点才比文字，第 10、20 秒都和上次不同，第 30 秒才提醒
    await growing.locator('clipper-dock .toast').waitFor({ timeout: 15_000 });
    await ticking.locator('clipper-dock .toast').waitFor({ timeout: 12_000 });
    // 回答后来认出来了（这里把标记改回去，再插一个节点让插件重新扫描）：丝带挂上，提醒自动收起
    await broken.evaluate(() => {
      document.querySelectorAll('[data-chatgpt-search-unit-key$=":assistant-x"]').forEach(a => a.dataset.chatgptSearchUnitKey = a.dataset.chatgptSearchUnitKey.replace(/-x$/, ''));
      document.body.append(document.createElement('div'));
    });
    await broken.locator('clipper-ribbon').first().waitFor({ state: 'attached', timeout: 3_000 });
    await toast.waitFor({ state: 'detached', timeout: 2_000 });
    await Promise.all([broken, slow, thinking, growing, ticking].map(pg => pg.close()));
  });
});

// 2026-11-18 常浩的修复请求：生成图片的对话里回答没有「…:assistant」标记（docs/recon/2026-11-18-生成图片回答侦察记录.md）
describe('ChatGPT 生成图片的回答', () => {
  const BODY = '[data-response-body][data-chatgpt-search-message-ids]';
  let ip, r;

  before(async () => {
    const sw = ctx.serviceWorkers()[0];
    await sw.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
    });
    await setVault(sw);
    ip = await ctx.newPage();
    await ip.goto(IMAGE_ANSWER_URL);
    await ip.locator(`#second clipper-ribbon`).waitFor({ state: 'attached' });
    await ip.locator('#second img').evaluate(img => img.complete && img.naturalWidth ? null : new Promise(ok => img.addEventListener('load', ok, { once: true })));
    // 基准：把图上的「编辑」「分享」按钮藏起来后的回答
    await ip.addStyleTag({ content: '.bar-e5f6 button{visibility:hidden!important}' });
    const box = await ip.locator('#second').boundingBox();
    const baseline = await ip.locator('#second').screenshot();
    await ip.evaluate(() => document.querySelector('style:last-of-type').remove());
    const card = await (await collectCard(ip, '#second clipper-ribbon button')).innerText();
    const files = await sw.evaluate(async () => {
      const out = {};
      for await (const [, h] of (await navigator.storage.getDirectory()).entries())
        for await (const [f, fh] of h.entries()) {
          const file = await fh.getFile();
          out[f.endsWith('.md') ? 'note' : f] = f.endsWith('.md') ? await file.text() : [...new Uint8Array(await file.arrayBuffer())];
        }
      return out;
    });
    r = { box, baseline, card, note: files.note, png: Buffer.from(files['answer.png'] ?? []) };
  });

  after(() => ip?.close());

  test('两条只有图片的回答都挂上丝带，不提醒改版；收藏后写进 Vault', async () => {
    assert.equal(await ip.locator(`${BODY} clipper-ribbon`).count(), 2);
    assert.equal(await ip.locator('clipper-dock .toast').count(), 0);
    assert.match(r.card, /^已收藏\n/, r.card);
  });

  test('长图里有生成的图片（blob: 地址），不画图上的「编辑」「分享」按钮：和藏起按钮的真实渲染逐像素比', async () => {
    assert.equal(r.png.readUInt32BE(16), Math.round(r.box.width));
    const { ratio, sizes } = await pixelDiff(r.png, r.baseline);
    assert.ok(ratio < MAX_DIFF_RATIO, `不同像素占 ${(ratio * 100).toFixed(2)}%，尺寸 ${sizes}`);
  });

  test('笔记：提问取自同一轮的「换成蓝色」，正文写图片说明，不收按钮文字', () => {
    const n = r.note;
    assert.match(n, /换成蓝色/);
    assert.ok(!n.includes('橙色'), '不该取到上一轮的提问');
    assert.match(n, /已生成图像 1/);
    for (const s of ['编辑', '分享', 'ChatGPT 说：']) assert.ok(!n.includes(s), `笔记里不该有「${s}」`);
  });
});

describe('只收选中段落（荧光笔丝带）', () => {
  const MSG = '[data-testid="assistant-message"]';
  const NOISE = '[data-cds="TurnStatus"], :has(> [data-testid="message-actions"])';
  let sw, cp;
  // 在 root 里从含 a 的文字中间选到含 b 的文字中间
  const select = (pg, root, a, b) => pg.evaluate(([root, a, b]) => {
    const find = s => {
      const w = document.createTreeWalker(document.querySelector(root), NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) { const i = n.data.indexOf(s); if (i >= 0) return [n, i + 1]; }
      throw new Error(`找不到「${s}」`);
    };
    const r = document.createRange();
    r.setStart(...find(a));
    r.setEnd(...find(b));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }, [root, a, b]);
  // Vault 测试文件夹里的收藏：文件夹名 → { 笔记文本 note, 长图字节 png }
  const vault = () => sw.evaluate(async () => {
    const out = {};
    for await (const [d, h] of (await navigator.storage.getDirectory()).entries()) {
      out[d] = {};
      for await (const [f, fh] of h.entries()) {
        const file = await fh.getFile();
        if (f.endsWith('.md')) out[d].note = await file.text();
        else out[d].png = [...new Uint8Array(await file.arrayBuffer())];
      }
    }
    return out;
  });
  const collect = async (pg, root) => {
    await pg.locator('clipper-dock .card').evaluateAll(cs => cs.forEach(c => c.setAttribute('data-old', '')));
    await pg.locator(`${root} clipper-ribbon button`).click();
    const card = pg.locator('clipper-dock .card:not([data-old])').filter({ has: pg.locator('.loc') });
    await card.waitFor({ timeout: 30_000 });
    return card.innerText();
  };

  before(async () => {
    sw = ctx.serviceWorkers()[0];
    await setVault(sw);   // 单独跑这组时也要有 Vault 文件夹
    cp = await ctx.newPage();
    await cp.goto(CLAUDE_URL);
    await cp.locator(`${MSG} clipper-ribbon`).waitFor({ state: 'attached' });
    await cp.evaluate(() => document.fonts.ready);
  });
  after(() => cp.close());

  test('Claude：选中标题和第一段，丝带拉长成荧光笔、竖着写「收藏选中·2块」；点了只收这两块，选区还在，取消选择后丝带恢复', async () => {
    const whole = Object.keys(await vault()).filter(d => !d.includes('（节选）'));
    const done = () => cp.locator(`${MSG} clipper-ribbon button.rib.done`).count(), wasDone = await done();
    await select(cp, `${MSG} .standard-markdown`, '快速排序示例', '带注释');
    const label = cp.locator(`${MSG} clipper-ribbon .vt`);
    await cp.locator(`${MSG} clipper-ribbon button.rib.pick`).waitFor({ timeout: 2_000 });
    assert.equal(await label.innerText(), '收藏选中·2块');
    await new Promise(r => setTimeout(r, 300));   // 等丝带拉长的过渡动画
    assert.ok((await cp.locator(`${MSG} clipper-ribbon button`).boundingBox()).height >= 100, '选中时丝带该拉长，放得下竖排字');
    const card = await collect(cp, MSG);
    assert.match(card, /^已收藏\n/, card);
    assert.match(card, /📁\s+快速排序示例（节选）\n/);
    assert.match(await cp.evaluate(() => getSelection().toString()), /排序示例\s+下面是带/, '点丝带不该清掉选区');
    assert.equal(await cp.locator(`${MSG} clipper-ribbon button.rib.pick`).count(), 1, '收完选区还在，丝带仍是荧光笔');

    await cp.evaluate(() => getSelection().removeAllRanges());
    await cp.locator(`${MSG} clipper-ribbon button.rib.pick`).waitFor({ state: 'detached', timeout: 2_000 });
    assert.ok(!(await label.isVisible()), '取消选择后竖排字该收起');
    assert.equal(await done(), wasDone, '丝带恢复成选中之前的状态：节选不算整条已收藏');

    const v = await vault(), ex = Object.keys(v).filter(d => d.includes('（节选）'));
    assert.equal(ex.length, 1);
    assert.match(ex[0], /^\d{4}-\d{2}-\d{2} 快速排序示例（节选）$/);
    const n = v[ex[0]].note;
    assert.match(n, /\ntags: \[claude收藏\]\nexcerpt: true\n---\n/);
    assert.match(n, /url: https:\/\/claude\.ai\/chat\/fixture#clip-[0-9a-f]{10}\n/, '跳回链接仍指向这条回答');
    assert.match(n, /\n## 快速排序示例\n/);
    assert.match(n, /下面是\*\*带注释\*\*的版本/);
    for (const s of ['quick_sort(a)', '判别式', 'Artifact', '排序**：先分区'])
      assert.ok(!n.includes(s), `节选笔记里不该有「${s}」`);
    // 整条收藏还在、没被改
    for (const d of whole) assert.doesNotMatch(v[d].note, /excerpt/, `整条收藏「${d}」不该被节选覆盖`);

    // 长图：和浏览器里只留这两块（其余藏起来）的样子逐像素比
    await cp.addStyleTag({ content: `${NOISE}, ${MSG} [data-find-omitted]:has([data-cds="Card"]), ${MSG} .standard-markdown > :not(h2, p:first-of-type){display:none!important}` });
    const box = await cp.locator(MSG).boundingBox(), baseline = await cp.locator(MSG).screenshot();
    await cp.evaluate(() => document.querySelector('style:last-of-type').remove());
    const png = Buffer.from(v[ex[0]].png);
    assert.ok(Math.abs(png.readUInt32BE(20) - box.height) <= 1, `长图高 ${png.readUInt32BE(20)}，应为 ${box.height}`);
    const { ratio, sizes } = await pixelDiff(png, baseline);
    assert.ok(ratio < MAX_DIFF_RATIO, `不同像素占 ${(ratio * 100).toFixed(2)}%，尺寸 ${sizes}`);
    assert.equal(await cp.locator(`${MSG} [data-clipper-cut]`).count(), 0, '收完要清掉临时记号');
  });

  test('节选收藏：剪贴板里是只有选中几块的那张长图（FR-14）', async () => {
    await select(cp, `${MSG} .standard-markdown`, '快速排序示例', '带注释');
    const card = await collect(cp, MSG);
    assert.match(card, /PNG 文件\n\d+px · 已复制\n/, card);
    const v = await vault(), png = Buffer.from(v[Object.keys(v).find(d => d.includes('（节选）'))].png);
    assert.deepEqual(await clipboard(cp), [png.readUInt32BE(16), png.readUInt32BE(20)]);
    await cp.evaluate(() => getSelection().removeAllRanges());
  });

  test('Claude：同样几块再收一次覆盖原节选；选了别的块另存一份', async () => {
    await select(cp, `${MSG} .standard-markdown`, '快速排序示例', '带注释');
    await collect(cp, MSG);
    let ex = Object.keys(await vault()).filter(d => d.includes('（节选）'));
    assert.equal(ex.length, 1, `同样几块应覆盖：${ex}`);
    await select(cp, `${MSG} .standard-markdown`, '判别式', '两个不等实根');
    await cp.locator(`${MSG} clipper-ribbon .vt`).filter({ hasText: '收藏选中·3块' }).waitFor({ timeout: 2_000 });
    await collect(cp, MSG);
    ex = Object.keys(await vault()).filter(d => d.includes('（节选）'));
    assert.equal(ex.length, 2, `选了别的块应另存：${ex}`);
    await cp.evaluate(() => getSelection().removeAllRanges());
  });

  test('ChatGPT：选中一段和卡片网格里的一张卡，整个网格算一块；笔记只有这两块', async () => {
    const before = new Set(Object.keys(await vault()));
    await page.bringToFront();
    await select(page, ANSWER, '整理一个三人小团队', '要点 1.1');
    await page.locator(`${ANSWER} clipper-ribbon .vt`).filter({ hasText: '收藏选中·2块' }).waitFor({ timeout: 2_000 });
    const card = await collect(page, ANSWER);
    assert.match(card, /^已收藏\n/, card);
    const v = await vault(), d = Object.keys(v).find(k => !before.has(k));
    assert.match(d, /（节选）$/);
    const n = v[d].note;
    assert.match(n, /\nexcerpt: true\n/);
    assert.ok(n.includes('整理一个三人小团队'), n);
    for (const s of ['要点 1.1', '要点 1.4']) assert.ok(n.includes(s), `整个网格都该收：缺「${s}」`);
    // 笔记标题仍用回答标题，正文里不该有这个小节标题
    for (const s of ['## 一、目标与范围', '先确认输入', '二、角色分工', '事项 1'])
      assert.ok(!n.includes(s), `节选笔记里不该有「${s}」`);
    await page.evaluate(() => getSelection().removeAllRanges());
  });
});

describe('整段收藏（拉长书签）', () => {
  const MSG = '[data-testid="assistant-message"]';
  let sw, tp;
  // 按住丝带往下拉 dy 像素；release 为 false 时不松手
  const pull = async (pg, rib, dy, release = true) => {
    const b = await rib.boundingBox(), x = b.x + b.width / 2, y = b.y + 10;
    await pg.mouse.move(x, y);
    await pg.mouse.down();
    await pg.mouse.move(x, y + dy, { steps: 10 });
    if (release) await pg.mouse.up();
  };
  const mark = pg => pg.locator('clipper-dock .card').evaluateAll(cs => cs.forEach(c => c.setAttribute('data-old', '')));
  const fresh = pg => pg.locator('clipper-dock .card:not([data-old])');
  const scrollTop = () => tp.locator('.scroller').evaluate(e => e.scrollTop);
  // Vault 里的整段收藏文件夹：文件夹名 → { 文件名: 笔记文本，或长图的 [宽, 高]（测试自己写的小文件为空数组） }
  const threads = () => sw.evaluate(async () => {
    const out = {};
    for await (const [d, h] of (await navigator.storage.getDirectory()).entries()) {
      if (!d.endsWith('（整段）')) continue;
      out[d] = {};
      for await (const [f, fh] of h.entries()) {
        const file = await fh.getFile();
        if (f.endsWith('.md')) out[d][f] = await file.text();
        else if (file.size >= 24) { const v = new DataView(await file.arrayBuffer()); out[d][f] = [v.getUint32(16), v.getUint32(20)]; }
        else out[d][f] = [];
      }
    }
    return out;
  });
  const done = async pg => {
    const card = fresh(pg).filter({ has: pg.locator('.loc') });
    await card.waitFor({ timeout: 60_000 });
    return card.innerText();
  };

  before(async () => {
    sw = ctx.serviceWorkers()[0];
    await setVault(sw);
    tp = await ctx.newPage();
    await tp.goto(THREAD_URL);
    await tp.locator(`${MSG} clipper-ribbon`).first().waitFor({ state: 'attached' });
  });
  after(() => tp.close());

  test('拉不到 100px：丝带跟着变长、不变紫；松手弹回，不收藏', async () => {
    await mark(tp);
    const rib = tp.locator(`${MSG} clipper-ribbon button`).last();
    await pull(tp, rib, 60, false);
    const h = (await rib.boundingBox()).height;
    assert.ok(h >= 115 && h <= 125, `丝带该拉长到约 120px，实际 ${h}`);
    assert.equal(await rib.evaluate(b => b.classList.contains('ready')), false);
    await tp.mouse.up();
    await new Promise(r => setTimeout(r, 400));
    assert.ok((await rib.boundingBox()).height <= 60, '松手后该弹回');
    await new Promise(r => setTimeout(r, 600));
    assert.equal(await fresh(tp).count(), 0, '没拉到位不该收藏');
  });

  test('拉过 100px 变紫、写「松手收藏整段」；松手后从头读到尾（进度卡「正在读第 k 条」）、滚回原位；存成一个文件夹：6 张长图 + 1 篇按顺序的笔记', async () => {
    await mark(tp);
    const before = await scrollTop(), rib = tp.locator(`${MSG} clipper-ribbon button`).last();
    await pull(tp, rib, 150, false);
    assert.equal(await rib.evaluate(b => b.classList.contains('ready')), true, '拉过 100px 该变紫');
    assert.equal(await rib.locator('.vt').innerText(), '松手收藏整段');
    await tp.mouse.up();
    await fresh(tp).filter({ hasText: /正在读第 \d+ 条/ }).waitFor({ timeout: 5_000 });
    const text = await done(tp);
    assert.match(text, /^已收藏整段\n/, text);
    assert.ok(text.includes('第 1 问：请讲讲第 1 个主题的要点（整段）'), `文件夹名该取第一问：${text}`);
    assert.equal(await scrollTop(), before, '读完该滚回原位');
    const all = await threads(), names = Object.keys(all).filter(d => d.includes('第 1 问'));
    assert.equal(names.length, 1, JSON.stringify(Object.keys(all)));
    assert.match(names[0], /^\d{4}-\d{2}-\d{2} 第 1 问：请讲讲第 1 个主题的要点（整段）$/);
    const files = all[names[0]], imgs = Object.keys(files).filter(f => f.endsWith('.png')).sort();
    assert.deepEqual(imgs, [1, 2, 3, 4, 5, 6].map(k => `answer-0${k}.png`));
    for (const f of imgs) assert.ok(files[f][0] > 600 && files[f][1] > 150, `${f} 尺寸不对：${files[f]}`);
    const notes = Object.keys(files).filter(f => f.endsWith('.md'));
    assert.deepEqual(notes, ['第 1 问：请讲讲第 1 个主题的要点（整段）.md']);
    const note = files[notes[0]];
    assert.match(note, /^---\nsource: claude\nurl: https:\/\/claude\.ai\/chat\/thread\n[\s\S]*\nthread: true\n---\n/, note);
    assert.ok(!/incomplete|没读成/.test(note), note);
    // 每一问每一答按顺序：小标题、折叠的提问、打开原回答（带这条回答的编号）、长图、正文
    let at = 0;
    for (let k = 1; k <= 6; k++) {
      for (const s of [`## ${k}. 第 ${k} 问：请讲讲第 ${k} 个主题的要点`, '> [!question]- 提问', '[↩ 打开原回答](https://claude.ai/chat/thread#clip-',
        `![[answer-0${k}.png]]`, `第 ${k} 条回答`, `第 ${k} 条回答的第 6 段`]) {
        const i = note.indexOf(s, at);
        assert.ok(i >= 0, `第 ${k} 轮缺「${s}」或顺序不对`);
        at = i + s.length;
      }
    }
  });

  test('同一个对话再整段收藏：覆盖原文件夹，进度卡写「已更新整段」；上次多出来的长图删掉，用户自己放的文件不动', async () => {
    // 模拟上次收藏时这段对话多一条回答，以及用户自己放进去的文件
    await sw.evaluate(async () => {
      for await (const [d, h] of (await navigator.storage.getDirectory()).entries())
        if (d.includes('第 1 问') && d.endsWith('（整段）'))
          for (const f of ['answer-09.png', '我的批注.txt']) {
            const w = await (await h.getFileHandle(f, { create: true })).createWritable();
            await w.write('x');
            await w.close();
          }
    });
    await mark(tp);
    await pull(tp, tp.locator(`${MSG} clipper-ribbon button`).last(), 150);
    assert.match(await done(tp), /^已更新整段\n/);
    const all = await threads(), names = Object.keys(all).filter(d => d.includes('第 1 问'));
    assert.equal(names.length, 1, `不该另建文件夹：${Object.keys(all)}`);
    const files = Object.keys(all[names[0]]);
    assert.ok(!files.includes('answer-09.png'), '上次多出来的长图该删掉');
    assert.ok(files.includes('我的批注.txt'), '用户自己的文件不该动');
    assert.equal(files.length, 8, files.join(', '));
  });

  test('往下移动不到 6px 算点击：只收这一条', async () => {
    await mark(tp);
    await pull(tp, tp.locator(`${MSG} clipper-ribbon button`).last(), 4);
    const card = fresh(tp).filter({ has: tp.locator('.loc') });
    await card.waitFor({ timeout: 30_000 });
    assert.match(await card.innerText(), /^已收藏\n/);
  });

  test('ChatGPT：拉丝带松手，存下 2 张长图；整段收藏不动剪贴板（FR-14）', async () => {
    await mark(page);
    await page.bringToFront();
    await page.evaluate(() => navigator.clipboard.writeText('整段收藏前的剪贴板'));
    await page.locator(ANSWER).scrollIntoViewIfNeeded();
    await pull(page, page.locator(`${ANSWER} clipper-ribbon button`), 150);
    assert.match(await done(page), /^已收藏整段\n/);
    assert.equal(await clipboard(page), '整段收藏前的剪贴板');
    const all = await threads(), name = Object.keys(all).find(d => !d.includes('第 1 问'));
    assert.deepEqual(Object.keys(all[name]).filter(f => f.endsWith('.png')).sort(), ['answer-01.png', 'answer-02.png']);
  });
});

// 导出 PDF（FR-15）：收藏完点卡片上的「导出 PDF」，后台用 debugger 打印成 A4 存进「下载」。
// 核对 PDF 用本机的 poppler（pdfinfo、pdftotext；brew install poppler），不是 npm 依赖
describe('导出 PDF', () => {
  const MSG = '[data-testid="assistant-message"]';
  let sw;
  const poppler = (tool, file) => execFileSync(tool, [file, ...(tool === 'pdftotext' ? ['-'] : [])], { encoding: 'utf8' });
  // 点「导出 PDF」，等这一行变成「已存到」或「没导出成」；返回这一行的字、PDF 文件路径、插件给的文件名
  const exportFrom = async card => {
    const before = await sw.evaluate(() => self.__pdfNames.length);
    await card.locator('.pdf .pb').click();
    await card.locator('.pdf .ok, .pdf .bad').waitFor({ timeout: 30_000 });
    const row = await card.locator('.pdf').innerText();
    if (!(await card.locator('.pdf .ok').count())) return { row };
    let item;
    for (let i = 0; i < 50; i++) {
      [item] = await sw.evaluate(() => chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }));
      if (item?.state === 'complete') break;
      await new Promise(r => setTimeout(r, 200));
    }
    const names = await sw.evaluate(() => self.__pdfNames);
    assert.equal(names.length, before + 1, '该多下载一个 PDF');
    const info = poppler('pdfinfo', item.filename);
    return { row, file: item.filename, name: names.at(-1), text: poppler('pdftotext', item.filename),
      pages: Number(info.match(/^Pages:\s+(\d+)/m)[1]), size: info.match(/^Page size:\s+(.+)$/m)[1] };
  };
  // 同一页上互相压住的字（分页把一块挪到下一页、外层没跟着变高时，后面的内容会叠上来）：横向重叠超过窄的那个字一半、
  // 纵向中心相差不到矮的那个字一半才算（中文字的框比行高还高，上下两行的框本来就会擦到一点）
  const overlaps = file => {
    const out = [], xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' });
    for (const [i, pg] of xml.split('<page ').slice(1).entries()) {
      const w = [...pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)].map(m => [...m.slice(1, 5).map(Number), m[5]]);
      for (let a = 0; a < w.length; a++) for (let b = a + 1; b < w.length; b++) {
        const [ax0, ay0, ax1, ay1] = w[a], [bx0, by0, bx1, by1] = w[b];
        const ix = Math.min(ax1, bx1) - Math.max(ax0, bx0), dy = Math.abs((ay0 + ay1) - (by0 + by1)) / 2;
        if (ix > 0.5 * Math.min(ax1 - ax0, bx1 - bx0) && dy < 0.5 * Math.min(ay1 - ay0, by1 - by0)) out.push(`第 ${i + 1} 页「${w[a][4]}」和「${w[b][4]}」`);
      }
    }
    return out;
  };
  const pull = async (pg, rib, dy) => {
    const b = await rib.boundingBox(), x = b.x + b.width / 2, y = b.y + 10;
    await pg.mouse.move(x, y);
    await pg.mouse.down();
    await pg.mouse.move(x, y + dy, { steps: 10 });
    await pg.mouse.up();
  };

  before(async () => {
    sw = ctx.serviceWorkers()[0];
    await setVault(sw);
    // 记下插件给 PDF 起的名字（Playwright 会把下载文件改成随机名）
    await sw.evaluate(() => {
      self.__pdfNames = [];
      const download = chrome.downloads.download.bind(chrome.downloads);
      chrome.downloads.download = (opts, ...rest) => {
        if (opts.filename?.endsWith('.pdf')) self.__pdfNames.push(opts.filename);
        return download(opts, ...rest);
      };
    });
  });

  test('ChatGPT 整条收藏：卡片底部「导出 PDF」+「默认存储地址为「下载」」；点了存成 A4 PDF，有标题、来源、提问和回答文字，表格不跨页，不附长图和属性区', async () => {
    await page.bringToFront();
    const card = await collectCard(page, `${ANSWER} clipper-ribbon button`);
    assert.equal(await card.locator('.pdf .pb').innerText(), '📄 导出 PDF');
    assert.equal(await card.locator('.pdf .n').innerText(), '默认存储地址为「下载」');
    const tabs = ctx.pages().length;
    const r = await exportFrom(card);
    assert.match(r.row, /^📄 已存到「下载」· (\d+) 页\s*在访达中显示$/, r.row);
    assert.equal(Number(r.row.match(/(\d+) 页/)[1]), r.pages, '卡片上的页数该和 PDF 一致');
    assert.ok(r.pages >= 2, `长回答该分成多页，实际 ${r.pages} 页`);
    assert.match(r.size, /^595\.\d+ x 841\.\d+ pts \(A4\)$/);
    assert.match(r.name, /^\d{4}-\d{2}-\d{2} 一、目标与范围\.pdf$/, '存进「下载」根目录，文件名同收藏文件夹');
    assert.equal(ctx.pages().length, tabs, '打印用的标签页该关掉');
    for (const s of ['一、目标与范围', 'ChatGPT · ', '（北京时间）', 'https://chatgpt.com/c/fixture#clip-', '提问', '帮我设计一个小团队的周度工作节奏', '四、工具与约定', '负责人 丙'])
      assert.ok(r.text.includes(s), `PDF 里该有「${s}」`);
    for (const s of ['tags:', 'answer.png', '打开原回答', 'captured'])
      assert.ok(!r.text.includes(s), `PDF 里不该有「${s}」`);
    // 每张表 5 行：哪一页有「事项 1」就该有同样多的「事项 5」，否则有表被切开了
    assert.deepEqual(overlaps(r.file).slice(0, 5), [], '不该有字叠在一起');
    // 卡片（「要点 x.y」+ 一句「第 n 条说明」）同理：标题和说明该在同一页
    for (const [i, p] of r.text.split('\f').entries()) {
      assert.equal(p.split('事项 1').length, p.split('事项 5').length, `第 ${i + 1} 页有表格被切开了`);
      assert.equal(p.split(/要点 \d+\.\d/).length, p.split(/条说明/).length, `第 ${i + 1} 页有卡片被切开了`);
    }
  });

  test('Claude 节选：PDF 只有选中的几块，标题带「（节选）」', async () => {
    const cp = await ctx.newPage();
    await cp.goto(CLAUDE_URL);
    await cp.locator(`${MSG} clipper-ribbon`).waitFor({ state: 'attached' });
    await cp.evaluate(() => {
      const root = document.querySelector('[data-testid="assistant-message"] .standard-markdown'), r = document.createRange();
      r.setStart(root.querySelector('h2').firstChild, 1);
      r.setEnd(root.querySelector('p strong').firstChild, 1);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await cp.locator(`${MSG} clipper-ribbon button.rib.pick`).waitFor({ timeout: 2_000 });
    const r = await exportFrom(await collectCard(cp, `${MSG} clipper-ribbon button`));
    assert.match(r.name, /^\d{4}-\d{2}-\d{2} 快速排序示例（节选）\.pdf$/);
    for (const s of ['快速排序示例（节选）', 'Claude · ', '用 Python 写一个快速排序，再给一张表和公式。', '带注释'])
      assert.ok(r.text.includes(s), `PDF 里该有「${s}」`);
    for (const s of ['quick_sort(a)', '两个不等实根', '先分区再递归'])
      assert.ok(!r.text.includes(s), `节选 PDF 里不该有「${s}」`);
    await cp.close();
  });

  test('整段收藏：PDF 每一轮一节，6 问 6 答都在，标题带「（整段）」', async () => {
    const tp = await ctx.newPage();
    await tp.goto(THREAD_URL);
    await tp.locator(`${MSG} clipper-ribbon`).first().waitFor({ state: 'attached' });
    await tp.locator('clipper-dock .card').evaluateAll(cs => cs.forEach(c => c.setAttribute('data-old', '')));
    await pull(tp, tp.locator(`${MSG} clipper-ribbon button`).last(), 150);
    const card = tp.locator('clipper-dock .card.ok:not([data-old])').first();
    await card.waitFor({ timeout: 60_000 });
    const r = await exportFrom(card);
    assert.match(r.name, /^\d{4}-\d{2}-\d{2} 第 1 问.*（整段）\.pdf$/, r.name);
    assert.ok(r.text.includes('（整段）'));
    for (let k = 1; k <= 6; k++) {
      assert.ok(r.text.includes(`${k}. 第 ${k} 问`), `该有第 ${k} 轮的小标题`);
      assert.ok(r.text.includes(`第 ${k} 个主题`), `该有第 ${k} 问的提问`);
    }
    await tp.close();
  });

  test('导出失败：写「没导出成」和中文原因（Chrome 的英文报错翻成怎么办）、点「重试」再导；打印用的标签页都关掉', async () => {
    await page.bringToFront();
    const card = await collectCard(page, `${ANSWER} clipper-ribbon button`), tabs = ctx.pages().length;
    // 只让下一次接 debugger 失败
    await sw.evaluate(() => {
      const attach = chrome.debugger.attach.bind(chrome.debugger);
      chrome.debugger.attach = async () => { chrome.debugger.attach = attach; throw new Error('Another debugger is already attached to the tab with id: 1.'); };
    });
    const bad = await exportFrom(card);
    assert.match(bad.row, /^没导出成：第 2 步「接上调试」：打印页正被别的调试工具占用，关掉后点「重试」\s*重试$/, bad.row);
    assert.equal(ctx.pages().length, tabs, '失败了打印用的标签页也该关掉');
    await card.locator('.pdf .lk').click();
    await card.locator('.pdf .ok').waitFor({ timeout: 30_000 });
    assert.match(await card.locator('.pdf').innerText(), /^📄 已存到「下载」· \d+ 页/);
  });

  test('某一步一直不完成（真实 Chrome 里卡在「正在导出」过）：到时停下，写清卡在第几步，标签页关掉，能重试', async () => {
    await page.bringToFront();
    const card = await collectCard(page, `${ANSWER} clipper-ribbon button`), tabs = ctx.pages().length;
    // 打印这一步永远不回；限时改成 1.5 秒
    await sw.evaluate(() => {
      self.__pdfLimits = { print: 1500 };
      const send = chrome.debugger.sendCommand.bind(chrome.debugger);
      chrome.debugger.sendCommand = (t, method, ...rest) => {
        if (method !== 'Page.printToPDF') return send(t, method, ...rest);
        chrome.debugger.sendCommand = send;
        return new Promise(() => {});
      };
    });
    const bad = await exportFrom(card);
    assert.match(bad.row, /^没导出成：第 3 步「打印」超过 1\.5 秒没完成，点「重试」再导一次\s*重试$/, bad.row);
    assert.equal(ctx.pages().length, tabs, '超时了打印用的标签页也该关掉');
    await sw.evaluate(() => { delete self.__pdfLimits; });
    await card.locator('.pdf .lk').click();
    await card.locator('.pdf .ok').waitFor({ timeout: 30_000 });
  });
});

// 后台服务进程：插件重新加载过就有新旧两个，取最新的
const worker = () => ctx.serviceWorkers().at(-1);

// 放在最后两条：会重新加载插件
test('插件更新或重新加载后，已开的页面不用刷新：补装新脚本，每条回答只有一套丝带、不提醒刷新、点丝带能收藏（FR-9，2026-11-19 常浩选「只补装」）', async () => {
  await page.goto(URL);
  await page.locator(`${ANSWER} clipper-ribbon`).waitFor({ state: 'attached' });
  const answers = await page.locator('[data-chatgpt-search-unit-key$=":assistant"]').count();
  // 重载前选好 Vault 文件夹：重载后点丝带要能真正写进去（设置也不因重载丢失）
  await setVault(worker());
  // 真重载：同扩展页的「重新加载」。chrome.runtime.reload() 在 Playwright 里重载后插件起不来（L-21）
  const port = fs.readFileSync(path.join(dir, 'profile', 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const cdp = await (await chromium.connectOverCDP(`http://127.0.0.1:${port}`)).newBrowserCDPSession();
  const fresh = ctx.waitForEvent('serviceworker', { timeout: 10_000 });
  await cdp.send('Extensions.loadUnpacked', { path: EXT });
  await fresh;
  await new Promise(r => setTimeout(r, 1500));
  // 页面一有变动，连着旧插件的脚本就会提醒刷新；补装后旧脚本已让位，不该提醒
  await page.locator('main').evaluate(m => m.append(document.createElement('p')));
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(await page.locator('clipper-dock .toast').count(), 0, '补装后不该再提醒「插件已更新，刷新这页」');
  assert.equal(await page.locator('clipper-ribbon').count(), answers, '每条回答只该有一套丝带（旧脚本的要收起）');
  await page.locator('clipper-dock .card').evaluateAll(cs => cs.forEach(c => c.setAttribute('data-old', '')));
  const done = page.locator('clipper-dock .card.ok:not([data-old]), clipper-dock .card.bad:not([data-old])');
  await page.locator(`${ANSWER} clipper-ribbon button`).click();
  await done.waitFor({ timeout: 30_000 });
  const text = await done.innerText();
  assert.match(text, /^已(收藏|更新)/, text);
});

test('插件刷新后没刷新页面、也没补装上：右下角提醒刷新、点了就重新加载页面；收藏提示「刷新这个页面」，不一直卡在入库', async () => {
  await worker().evaluate(() => chrome.runtime.reload()).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  // 旧卡片 8 秒后自动关，按个数找新卡片会对不上：先给旧卡片打记号
  await page.locator('clipper-dock .card').evaluateAll(cs => cs.forEach(c => c.setAttribute('data-old', '')));
  const done = page.locator('clipper-dock .card.ok:not([data-old]), clipper-dock .card.bad:not([data-old])');
  await page.locator(`${ANSWER} clipper-ribbon button`).click();
  await done.waitFor({ timeout: 15_000 });
  const text = await done.innerText();
  assert.match(text, /^收藏失败\n[\s\S]*插件刚更新过，刷新这个页面后再收藏$/, text);
  assert.equal(await done.locator('li.on').count(), 0, '不该还有转圈的步骤');
  // 页面一有变动就提醒刷新（补装失败时的兜底）；点「刷新页面」页面重新加载、旧提醒没了。
  // chrome.runtime.reload() 在 Playwright 里重载后插件起不来（L-21），正好模拟「没补装上」；补装成功的情形见上一条
  const toast = page.locator('clipper-dock .toast');
  await toast.waitFor({ timeout: 2_000 });
  assert.match(await toast.innerText(), /^!\n插件已更新，刷新这页才能收藏\n这个页面还连着更新前的插件，点丝带会存不上。\n刷新页面\n✕$/);
  await Promise.all([page.waitForEvent('load', { timeout: 10_000 }), toast.locator('.acts button').click()]);
  assert.equal(await page.locator('clipper-dock').count(), 0, '刷新后旧插件留下的提醒该没了');
});
