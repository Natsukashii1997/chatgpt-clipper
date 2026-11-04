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
const CLAUDE_URL = 'https://claude.ai/chat/fixture', CLAUDE_BROKEN_URL = 'https://claude.ai/chat/broken';
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
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  // 只放行测试页，其余请求一律拦掉，顺带保证快照不依赖网络
  await ctx.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: FIXTURE });
    if (url.startsWith(CLAUDE_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: CLAUDE_FIXTURE });
    // 模拟 Claude 改版：回答换了标记，插件认不出
    if (url.startsWith(CLAUDE_BROKEN_URL)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: CLAUDE_FIXTURE.replaceAll('data-testid="assistant-message"', 'data-testid="assistant-turn"') });
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

// Playwright 把下载的文件改成随机名，按数据类型找
const file = type => fs.readFileSync(result.items.find(d => d.url.startsWith(`data:${type}`)).filename);
const png = () => file('image/png');
const md = () => result.note;

test('没选 Vault 文件夹（比如没装 Obsidian）：只把长图下载到 Chrome，最后一步标「无 Obsidian」，给「去设置」', () => {
  assert.match(result.card, /入库\s+无 Obsidian/);
  assert.match(result.card, /^无法保存，长图已下载\n/);
  assert.match(result.card, /⬇️\s+一、目标与范围\n无 Obsidian，长图已下载到 Chrome\n去设置$/);
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
  const collect = async () => {
    const done = page.locator('clipper-dock .card.ok, clipper-dock .card.bad');
    const before = await done.count();
    await page.locator(`${ANSWER} clipper-ribbon button`).click();
    await done.nth(before).waitFor({ timeout: 30_000 });
    return done.nth(before).innerText();
  };

  const first = await collect();
  let t = await tree(), names = Object.keys(t);
  assert.equal(names.length, 1, JSON.stringify(t));
  assert.match(names[0], /^\d{4}-\d{2}-\d{2} 一、目标与范围$/);
  assert.equal(t[names[0]]['answer.png'], png().length);
  assert.equal(t[names[0]]['一、目标与范围.md'], Buffer.byteLength(md()));
  assert.match(first, /^已收藏\n/);
  assert.match(first, /入库\s+已存入/);
  assert.match(first, /📁\s+一、目标与范围\n\d{4}-\d{2}-\d{2}$/);

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
  const collect = async () => {
    const done = page.locator('clipper-dock .card.ok, clipper-dock .card.bad');
    const before = await done.count();
    await page.locator(`${ANSWER} clipper-ribbon button`).click();
    await done.nth(before).waitFor({ timeout: 30_000 });
    return done.nth(before).innerText();
  };

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
  const done = page.locator('clipper-dock .card.ok, clipper-dock .card.bad');
  const before = await done.count();
  await page.locator('[data-chatgpt-search-unit-key="fallback-turn-4:1:assistant"] clipper-ribbon button').click();
  await done.nth(before).waitFor({ timeout: 30_000 });
  const card = await done.nth(before).innerText();
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

  test('收藏后补一句「为什么存」：写进笔记，按键不传给页面；再收藏沿用（Obsidian 里手改过的也认）；改成空就去掉', async () => {
    const sw = ctx.serviceWorkers()[0];
    const note = () => sw.evaluate(async () => {
      for await (const [, h] of (await navigator.storage.getDirectory()).entries())
        for await (const [f, fh] of h.entries()) if (f.endsWith('.md')) return (await fh.getFile()).text();
    });
    const collect = async () => {
      const done = cp.locator('clipper-dock .card.ok, clipper-dock .card.bad');
      const before = await done.count();
      await cp.locator(`${MSG} clipper-ribbon button`).click();
      await done.nth(before).waitFor({ timeout: 30_000 });
      return done.nth(before);
    };
    const write = async (card, text) => {
      await card.locator('.why input').fill(text);
      await card.locator('.why input').press('Enter');
    };
    await cp.evaluate(() => { window.__keys = 0; document.addEventListener('keydown', () => window.__keys++); });

    let card = await collect();
    assert.equal(await card.locator('.why input').getAttribute('placeholder'), '为什么存？写一句（可不填）');
    await card.locator('.why input').click();
    await cp.keyboard.type('abc');
    await card.locator('.why input').press('Escape');
    assert.equal(await cp.evaluate(() => window.__keys), 0, '输入框里的按键不该传到页面');
    await write(card, '  下周写方案   用 ');
    await card.locator('.said').waitFor();
    assert.match(await card.locator('.said').innerText(), /^下周写方案 用\s*改$/);
    let n = await note();
    assert.match(n, /\ntitle: "快速排序示例"\nwhy: "下周写方案 用"\n/);
    assert.match(n, /\n---\n\n> \[!note\] 为什么存\n> 下周写方案 用\n\n\[↩ 打开原回答\]\(.+\)\n\n> \[!question\]- 提问\n/);
    assert.ok(n.includes('![[answer.png]]'), '补写不该动长图的嵌入');

    // 在 Obsidian 里手改成不带引号的，再收藏：沿用手改的那句，卡片直接显示
    await sw.evaluate(async () => {
      for await (const [, h] of (await navigator.storage.getDirectory()).entries())
        for await (const [f, fh] of h.entries()) if (f.endsWith('.md')) {
          const t = (await (await fh.getFile()).text()).replace(/^why: .*$/m, 'why: 手改过');
          const w = await fh.createWritable(); await w.write(t); await w.close();
        }
    });
    card = await collect();
    assert.match(await card.locator('.said').innerText(), /^手改过/);
    n = await note();
    assert.match(n, /\nwhy: "手改过"\n/);
    assert.equal(n.match(/\[!note\] 为什么存/g).length, 1);
    assert.match(n, /> \[!note\] 为什么存\n> 手改过\n/);

    await card.locator('.said button').click();
    await write(card, '');
    for (let i = 0; i < 25 && /why:/.test(n = await note()); i++) await new Promise(r => setTimeout(r, 200));
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
    const collect = async () => {
      const done = cp.locator('clipper-dock .card.ok, clipper-dock .card.bad');
      const before = await done.count();
      await cp.locator(`${MSG} clipper-ribbon button`).click();
      await done.nth(before).waitFor({ timeout: 30_000 });
      return done.nth(before);
    };
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
    assert.ok(await card.locator('.why input, .said').count(), '标黄时也能写一句');
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

  test('改版自检：对话页 10 秒后一条回答都没认出来，右下角提醒一次；正常页面不提醒', async () => {
    const broken = await ctx.newPage();
    await broken.goto(CLAUDE_BROKEN_URL);
    await new Promise(r => setTimeout(r, 11_000));
    const toast = broken.locator('clipper-dock .toast');
    assert.equal(await toast.count(), 1);
    assert.match(await toast.innerText(), /^!\n收藏按钮没挂上\n这页有对话，但插件没认出回答，Claude 可能改版了。\n✕$/);
    await toast.locator('button').click();
    assert.equal(await toast.count(), 0);
    assert.equal(await cp.locator('clipper-dock .toast').count(), 0, '正常页面不该提醒');
    await broken.close();
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

  test('Claude：选中标题和第一段，丝带变荧光笔写「收藏选中 · 2 块」；点了只收这两块，选区还在，取消选择后丝带恢复', async () => {
    const whole = Object.keys(await vault()).filter(d => !d.includes('（节选）'));
    const done = () => cp.locator(`${MSG} clipper-ribbon button.rib.done`).count(), wasDone = await done();
    await select(cp, `${MSG} .standard-markdown`, '快速排序示例', '带注释');
    const pill = cp.locator(`${MSG} clipper-ribbon .pill`);
    await cp.locator(`${MSG} clipper-ribbon button.rib.pick`).waitFor({ timeout: 2_000 });
    assert.equal(await pill.innerText(), '收藏选中 · 2 块');
    const card = await collect(cp, MSG);
    assert.match(card, /^已收藏\n/, card);
    assert.match(card, /📁\s+快速排序示例（节选）\n/);
    assert.match(await cp.evaluate(() => getSelection().toString()), /排序示例\s+下面是带/, '点丝带不该清掉选区');
    assert.equal(await cp.locator(`${MSG} clipper-ribbon button.rib.pick`).count(), 1, '收完选区还在，丝带仍是荧光笔');

    await cp.evaluate(() => getSelection().removeAllRanges());
    await cp.locator(`${MSG} clipper-ribbon button.rib.pick`).waitFor({ state: 'detached', timeout: 2_000 });
    assert.ok(!(await pill.isVisible()), '取消选择后标签该收起');
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

  test('Claude：同样几块再收一次覆盖原节选；选了别的块另存一份', async () => {
    await select(cp, `${MSG} .standard-markdown`, '快速排序示例', '带注释');
    await collect(cp, MSG);
    let ex = Object.keys(await vault()).filter(d => d.includes('（节选）'));
    assert.equal(ex.length, 1, `同样几块应覆盖：${ex}`);
    await select(cp, `${MSG} .standard-markdown`, '判别式', '两个不等实根');
    await cp.locator(`${MSG} clipper-ribbon .pill`).filter({ hasText: '收藏选中 · 3 块' }).waitFor({ timeout: 2_000 });
    await collect(cp, MSG);
    ex = Object.keys(await vault()).filter(d => d.includes('（节选）'));
    assert.equal(ex.length, 2, `选了别的块应另存：${ex}`);
    await cp.evaluate(() => getSelection().removeAllRanges());
  });

  test('ChatGPT：选中一段和卡片网格里的一张卡，整个网格算一块；笔记只有这两块', async () => {
    const before = new Set(Object.keys(await vault()));
    await page.bringToFront();
    await select(page, ANSWER, '整理一个三人小团队', '要点 1.1');
    await page.locator(`${ANSWER} clipper-ribbon .pill`).filter({ hasText: '收藏选中 · 2 块' }).waitFor({ timeout: 2_000 });
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

// 放在最后：会重新加载插件
test('插件刷新后没刷新页面：收藏提示「刷新这个页面」，不一直卡在入库', async () => {
  await ctx.serviceWorkers()[0].evaluate(() => chrome.runtime.reload()).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  // 旧卡片 8 秒后自动关，按个数找新卡片会对不上：先给旧卡片打记号
  await page.locator('clipper-dock .card').evaluateAll(cs => cs.forEach(c => c.setAttribute('data-old', '')));
  const done = page.locator('clipper-dock .card.ok:not([data-old]), clipper-dock .card.bad:not([data-old])');
  await page.locator(`${ANSWER} clipper-ribbon button`).click();
  await done.waitFor({ timeout: 15_000 });
  const text = await done.innerText();
  assert.match(text, /^收藏失败\n[\s\S]*插件刚更新过，刷新这个页面后再收藏$/, text);
  assert.equal(await done.locator('li.on').count(), 0, '不该还有转圈的步骤');
});
