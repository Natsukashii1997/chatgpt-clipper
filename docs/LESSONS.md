# 开发实录与坑

踩过的坑记在这里，Claude 和 Codex 都读。排障、发布、改脚本之前，先搜一遍：`grep -n 关键词 docs/LESSONS.md`；换个项目也成立的坑在全局 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/LESSONS.md`（G-xx），也搜一遍。

## 怎么写

- 每轮交接时自问「本轮踩到新坑了吗」：有就在下面追加一条，并在 CURRENT.md 的交接里写「本轮新坑：L-xx」；没有就写「无」。
- 一条一个坑，编号只增不改。写现象、根因、正确做法、证据。证据写到能查的程度（提交号、文件与章节、证据目录）；查不到就写「未核实」，不编。
- 结论被推翻时改条目并注明日期，不删。

## 怎么升级

- 同类坑第 2 次出现：把正确做法写进 AGENTS.md 或 docs/OPERATIONS.md（一句话硬约束进 AGENTS.md，操作细节进 OPERATIONS.md），条目的「升级」改成写到了哪里。
- 能用机器判定的：写成测试或脚本（如 `scripts/check-rules.mjs`），条目注明。
- 换个项目也成立的（不依赖本项目的业务、页面、发布脚本）：提议提升到全局坑 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/LESSONS.md`，写成 G-xx；原条目保留，末尾加一行「提升：已提升为全局 G-xx（日期）」。只出提案，用户批准才写。
- 条目超过约 30 条时整理一次：已升级、且之后没再犯的，归档到 `docs/history/`。

---

还没有条目，第一条从 L-01 起，格式：

```markdown
## L-01 <一句话现象>（<YYYY-MM-DD>）

- 现象：
- 根因：
- 正确做法：
- 证据：
- 升级：未升级。
```

## L-01 计算样式内联后边框变成粗黑框（2026-11-02）

- 现象：把 ChatGPT 回答复制出来，只写入“与浏览器默认值不同”的计算样式，独立渲染后每个块都多了 3px 左右的黑色实线框，SVG 图标变成实心方块。
- 根因：Tailwind 预设给所有元素 `border: 0 solid`。比较时宽度 `0px` 与默认值相同被省略，只剩 `border-style: solid`，于是按默认宽度 medium 和默认颜色黑色画出边框；SVG 的 `fill`/`stroke` 同理被省略。
- 正确做法：`border-*`、`outline-*`、`fill`、`stroke`、`color`、`background-color`、字号、行高、宽高一律写全，不做默认值比较；其余属性可以比较后省略。
- 证据：[docs/recon/2026-11-02-侦察记录.md](recon/2026-11-02-侦察记录.md)「离线 HTML 快照实验」；对比截图在证据目录 `2026-11-02-recon/02-快照v1-边框坑.jpg`、`03-快照v2-修正后.jpg`。
- 升级：未升级。
