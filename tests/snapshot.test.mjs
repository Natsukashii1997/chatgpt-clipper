// 快照模块的端到端测试：Playwright 启动带插件的 Chromium，把固定测试页伪装成 chatgpt.com 打开，
// 点「收藏」，检查下载下来的 PNG。测试页内容是编的（tests/fixtures/card-answer.html）。
// 需要 Playwright 自带的 Chromium（正式版 Chrome 不支持命令行加载未打包插件）：npx playwright install chromium
import { test, before, after } from 'node:test';
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
  const media = await page.locator('#media').boundingBox();
  await page.locator(`${ANSWER} clipper-ribbon button`).click();
  await page.locator('clipper-dock .card.ok, clipper-dock .card.bad').waitFor({ timeout: 30_000 });
  const card = await page.locator('clipper-dock .card').innerText();

  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  let items = [];
  for (let i = 0; i < 50; i++) {
    items = await sw.evaluate(() => chrome.downloads.search({}));
    if (items.length >= 2 && items.every(d => d.state === 'complete')) break;
    await new Promise(r => setTimeout(r, 200));
  }
  result = { box, baseline, card, items, ribbon, clip, media };
});

after(async () => {
  await ctx?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

// Playwright 把下载的文件改成随机名，按数据类型找
const file = type => fs.readFileSync(result.items.find(d => d.url.startsWith(`data:${type}`)).filename);
const png = () => file('image/png');
const md = () => file('text/markdown').toString('utf8');

test('没选 Vault 文件夹时退回浏览器下载，说明原因并给「去设置」', () => {
  assert.match(result.card, /入库\s+未设置/);
  assert.match(result.card, /^已存到下载目录\n/);
  assert.match(result.card, /⬇️\s+一、目标与范围\n还没选 Vault 文件夹\n去设置$/);
  assert.match(result.card, /去设置$/);
  assert.doesNotMatch(result.card, /不完整/);
  assert.equal(result.items.length, 2);
  assert.equal(png().subarray(1, 4).toString(), 'PNG');
});

test('选了文件夹就写进去；同一条再收藏就覆盖；刷新后丝带显示已收藏；原文件夹被挪走就只提示', async () => {
  // 测试里弹不出选目录窗口：用扩展自己的私有存储区（OPFS）目录代替 Vault，按设置页的存法放进 IndexedDB
  const sw = ctx.serviceWorkers()[0];
  await sw.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('chatgpt-clipper', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onsuccess = () => { const tx = open.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(dir, 'vaultDir'); tx.oncomplete = resolve; tx.onerror = reject; };
      open.onerror = reject;
    });
  });
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
  assert.equal((await sw.evaluate(() => chrome.downloads.search({}))).length, 2, '写进 Vault 时不该再下载');
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

test('PNG 尺寸与回答一致（≥4000px 长图）', () => {
  const buf = png();
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert.equal(w, Math.round(result.box.width));
  assert.equal(h, Math.round(result.box.height));
  assert.ok(h >= 4000, `测试页回答只有 ${h}px`);
});

/** 两张 PNG 逐像素比，rect 只比回答里的这一块（相对回答左上角）；返回不同像素占比 */
async function pixelDiff(a, b, rect) {
  const p = await ctx.newPage();
  const stat = await p.evaluate(async ([a, b, tol, rect]) => {
    const load = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const [x, y] = await Promise.all([load(a), load(b)]);
    const r = rect ?? { x: 0, y: 0, width: Math.min(x.width, y.width), height: Math.min(x.height, y.height) };
    const w = Math.round(r.width), h = Math.round(r.height);
    const px = img => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, -Math.round(r.x), -Math.round(r.y)); return g.getImageData(0, 0, w, h).data; };
    const da = px(x), db = px(y);
    let diff = 0;
    for (let i = 0; i < da.length; i += 4)
      if (Math.abs(da[i] - db[i]) > tol || Math.abs(da[i + 1] - db[i + 1]) > tol || Math.abs(da[i + 2] - db[i + 2]) > tol) diff++;
    return { ratio: diff / (w * h), sizes: [x.width, x.height, y.width, y.height] };
  }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`, PIXEL_TOL, rect]);
  await p.close();
  return stat;
}

test('PNG 与浏览器真实渲染逐像素比，只差抗锯齿', async () => {
  const stat = await pixelDiff(png(), result.baseline);
  console.log(`  差异像素 ${(stat.ratio * 100).toFixed(2)}%，尺寸 ${stat.sizes.join('×')}`);
  assert.ok(stat.ratio < MAX_DIFF_RATIO, `差异像素 ${(stat.ratio * 100).toFixed(2)}% 超过 ${MAX_DIFF_RATIO * 100}%`);
});

test('长图里有跨域图片、网页字体、脚本画的 canvas（M1 验收 P4、P5、P10）', async () => {
  const { media, box } = result;
  const stat = await pixelDiff(png(), result.baseline, { x: media.x - box.x, y: media.y - box.y, width: media.width, height: media.height });
  console.log(`  第十节差异像素 ${(stat.ratio * 100).toFixed(2)}%`);
  assert.ok(stat.ratio < MAX_DIFF_RATIO, `第十节差异像素 ${(stat.ratio * 100).toFixed(2)}% 超过 ${MAX_DIFF_RATIO * 100}%：图片、字体或 canvas 没进长图`);
});

test('笔记：frontmatter、折叠的提问、嵌入长图', () => {
  const m = md();
  assert.match(m, /^---\nsource: chatgpt\nurl: https:\/\/chatgpt\.com\/c\/fixture\ncaptured: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\ntitle: "一、目标与范围"\ntags: \[chatgpt收藏\]\n---\n\n/);
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
  for (const bad of ['ChatGPT 说：', '打开文件', '复制代码', '文档\n', 'E=mc²', '⧉', '简短一点', '简版', '提供反馈', '1.0', 'favicons'])
    assert.ok(!m.includes(bad), `笔记里不该有：${bad}`);
});

test('正文：回答里看得见的文字全部保留（FR-4）', async () => {
  const m = md().replace(/\\\|/g, '|').replace(/\s+/g, ' ');   // 表格里的竖线转义过
  // 独立于转换代码取可见文字：跳过插件节点、读屏标题、公式渲染层（笔记里放源码）、文档块头、按钮、ChatGPT 复制时排除的元素
  const texts = await page.locator(ANSWER).evaluate(el => {
    const out = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const p = n.parentElement, t = n.textContent.replace(/\s+/g, ' ').trim();
      if (!t || p.closest('clipper-ribbon, [data-conversation-role], .katex, [data-client-defined-widget] header, button, [data-markdown-copy="exclude"]')) continue;
      if (!p.checkVisibility({ visibilityProperty: true })) continue;
      out.push(t);
    }
    return out;
  });
  assert.ok(texts.length > 100, `只取到 ${texts.length} 段文字`);
  const missing = texts.filter(t => !m.includes(t));
  if (process.env.DUMP_MD) fs.writeFileSync(process.env.DUMP_MD, md());
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
