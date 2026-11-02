"""对比原型①的长图：以 A（浏览器真实渲染）为基准，算 C 的像素差异，并找差异最大的区段。
用法：python3 -I compare.py <目录> <轮次>   例：compare.py ~/Downloads/chatgpt-clipper-proto turn-3
"""
import sys, json
from PIL import Image, ImageChops

d, turn = sys.argv[1], sys.argv[2]
a = Image.open(f'{d}/{turn}-A.png').convert('RGB')
c = Image.open(f'{d}/{turn}-C.png').convert('RGB')
out = {'A': a.size, 'C': c.size}
h = min(a.height, c.height)
a2, c2 = a.crop((0, 0, a.width, h)), c.crop((0, 0, a.width, h))
diff = ImageChops.difference(a2, c2).convert('L').point(lambda v: 255 if v > 24 else 0)
hist = diff.histogram()
total = a.width * h
out['diffPixels'] = hist[255]
out['diffRatio'] = round(hist[255] / total, 5)
# 按 40px 一段统计差异，列出最差的 6 段
band = 40
rows = []
for y in range(0, h, band):
    seg = diff.crop((0, y, a.width, min(h, y + band)))
    n = seg.histogram()[255]
    if n:
        rows.append((n, y))
rows.sort(reverse=True)
out['worstBands'] = [{'y': y, 'pixels': n} for n, y in rows[:6]]
out['bandsWithDiff'] = len(rows)
out['bandsTotal'] = (h + band - 1) // band
diff.save(f'{d}/{turn}-diff.png')
# 最差三段做 A | C | 差异 并排图，方便目视
for i, (n, y) in enumerate(rows[:3]):
    y0 = max(0, y - 60); y1 = min(h, y + band + 60)
    strip = Image.new('RGB', (a.width * 3 + 20, y1 - y0), 'red')
    strip.paste(a2.crop((0, y0, a.width, y1)), (0, 0))
    strip.paste(c2.crop((0, y0, a.width, y1)), (a.width + 10, 0))
    strip.paste(diff.crop((0, y0, a.width, y1)).convert('RGB'), (a.width * 2 + 20, 0))
    strip.save(f'{d}/{turn}-worst{i + 1}.png')
print(json.dumps(out, ensure_ascii=False, indent=1))
