// 把 scripts/icon.svg 渲染成插件图标 PNG（16/32/48/128），放进 public/icon/，WXT 构建时自动写进 manifest 的 icons。
// 用已装的 Playwright 出图，不加依赖。用法：node scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/icon');
const svg = fs.readFileSync(path.join(ROOT, 'scripts/icon.svg'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
  await page.locator('img').evaluate(img => img.decode());
  await page.screenshot({ path: path.join(OUT, `${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
console.log(`图标已生成：${OUT}`);
