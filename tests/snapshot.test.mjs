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
  await ctx.route('**/*', route => (route.request().url().startsWith(URL) ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: FIXTURE }) : route.abort()));
  page = await ctx.newPage();
  await page.goto(URL);
  await page.locator(`${ANSWER} clipper-ribbon`).waitFor({ state: 'attached' });

  const answer = page.locator(ANSWER);
  const box = await answer.boundingBox();
  const baseline = await answer.screenshot();   // 浏览器真实渲染，作对比基准；先截，免得截进进度卡
  const ribbon = await page.locator(`${ANSWER} clipper-ribbon button`).boundingBox();
  const clip = await page.locator('.clip').boundingBox();
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
  result = { box, baseline, card, items, ribbon, clip };
});

after(async () => {
  await ctx?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const png = () => fs.readFileSync(result.items[0].filename);

test('三步都完成，只下载了一张 PNG', () => {
  assert.match(result.card, /\nanswer\.png\n/);
  assert.equal(result.items.length, 1);
  assert.equal(png().subarray(1, 4).toString(), 'PNG');
});

test('丝带落在回答左侧空白里，不被外层裁剪容器裁掉', () => {
  const { ribbon, clip, box } = result;
  // overflow-x: clip 按内边距盒裁剪，边界就是容器的左边
  assert.ok(ribbon.x >= clip.x, `丝带左边 ${ribbon.x} 超出了裁剪容器左边 ${clip.x}`);
  assert.ok(ribbon.x + ribbon.width <= box.x, '丝带压到了回答正文');
  assert.ok(ribbon.width >= 12 && ribbon.height >= 40, '丝带太小');
});

test('进度卡标题取看得见的第一个标题，跳过读屏专用的隐藏标题', () => {
  assert.match(result.card, /^一、目标与范围\n/);
});

test('PNG 尺寸与回答一致（≥4000px 长图）', () => {
  const buf = png();
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert.equal(w, Math.round(result.box.width));
  assert.equal(h, Math.round(result.box.height));
  assert.ok(h >= 4000, `测试页回答只有 ${h}px`);
});

test('PNG 与浏览器真实渲染逐像素比，只差抗锯齿', async () => {
  const p = await ctx.newPage();
  const stat = await p.evaluate(async ([a, b, tol]) => {
    const load = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const [x, y] = await Promise.all([load(a), load(b)]);
    const w = Math.min(x.width, y.width), h = Math.min(x.height, y.height);
    const px = img => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const da = px(x), db = px(y);
    let diff = 0;
    for (let i = 0; i < da.length; i += 4)
      if (Math.abs(da[i] - db[i]) > tol || Math.abs(da[i + 1] - db[i + 1]) > tol || Math.abs(da[i + 2] - db[i + 2]) > tol) diff++;
    return { ratio: diff / (w * h), sizes: [x.width, x.height, y.width, y.height] };
  }, [`data:image/png;base64,${png().toString('base64')}`, `data:image/png;base64,${result.baseline.toString('base64')}`, PIXEL_TOL]);
  await p.close();
  console.log(`  差异像素 ${(stat.ratio * 100).toFixed(2)}%，尺寸 ${stat.sizes.join('×')}`);
  assert.ok(stat.ratio < MAX_DIFF_RATIO, `差异像素 ${(stat.ratio * 100).toFixed(2)}% 超过 ${MAX_DIFF_RATIO * 100}%`);
});
