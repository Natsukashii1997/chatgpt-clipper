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

## L-02 声明了 `<all_urls>` 仍无法调用 `captureVisibleTab`（2026-11-02）

- 现象：原型① 的内容脚本请后台调用 `chrome.tabs.captureVisibleTab`，报错 `The 'activeTab' permission is not in effect because this extension has not been in invoked.`；manifest 已声明 `host_permissions: ["<all_urls>"]`，标签页可见且有焦点。
- 根因：未核实。推测本机 Chrome 对该扩展的站点访问设为“点击时”，或该接口实际要求扩展被用户调用过（点插件图标、快捷键等）。
- 正确做法：需要截可视区时，从用户点插件图标（`action`）或快捷键触发，并声明 `activeTab`；不要指望页面内按钮点击能授权。本项目主方案已改为快照栅格化，不依赖该接口。
- 证据：[docs/recon/2026-11-02-原型1-长图.md](recon/2026-11-02-原型1-长图.md)「结果」表 B 行。
- 升级：未升级。

## L-03 `fallback-turn-N:K` 编号会随页面加载整体平移（2026-11-02）

- 现象：同一条对话、同一条回答，上午记作 `fallback-turn-3:3:assistant`（3850px 卡片回答）、`fallback-turn-4:2:assistant`（9058px），下午重新打开变成 `fallback-turn-2:3:assistant`、`fallback-turn-3:2:assistant`，高度不变，确认是同一批回答。
- 根因：未核实。名字里的 `fallback` 和编号规律看，是 ChatGPT 按回答在页面里的位置临时生成的键，不是消息 ID；推测前面某轮是否加载完会让序号整体偏移。
- 正确做法：`data-chatgpt-search-unit-key` 只用来在当前页面定位回答（看末尾 `:assistant`），不当作跨次加载的稳定 ID，不写进笔记、不用来去重；要指认某条回答时同时记高度或开头文字。
- 证据：本轮交接「验证」一行；证据目录 `2026-11-02-m1-2-real-page/`。
- 升级：未升级。

## L-04 回答内容晚于回答节点出现，挂丝带时读到的文字不全（2026-11-02）

- 现象：收藏过的回答刷新页面后丝带仍是黄色（未收藏），测试页上却正常。
- 根因：真实页面先放出 `[data-chatgpt-search-unit-key$=":assistant"]` 节点，回答内容稍后才填进去；内容脚本在节点出现时就算指纹查「是否收藏过」，此时文字不全，之后内容补齐也没再查。测试页是静态的，内容一开始就在，所以测不出来。另：指纹原用 `innerText`，会随悬停、折叠等显示状态变化。
- 正确做法：凡是读回答内容做判断的，都要在内容变化后重做（本项目：每次扫描比较 `textContent` 长度，变了就重查）；指纹用 `textContent`，不用 `innerText`。测试里用 `addInitScript` 把回答先清空、1.5 秒后再放回去，复现「内容晚到」。
- 证据：本轮交接「测试」一行（改前该用例报红、改后通过）；`tests/snapshot.test.mjs` 写入 Vault 用例。
- 升级：已写成测试（同上）。

## L-05 Playwright 指定 downloadsPath 后，下载的文件名是随机 GUID（2026-11-02）

- 现象：测试按 `.md` / `.png` 扩展名找下载文件，全部找不到。
- 根因：`launchPersistentContext({ downloadsPath })` 下，Chromium 把文件存成 GUID 文件名（无扩展名），`chrome.downloads.search` 返回的 `filename` 也是这个路径。
- 正确做法：按 `DownloadItem.url` 的数据类型（`data:text/markdown`、`data:image/png`）或 `mime` 区分文件，不按文件名。
- 证据：`tests/snapshot.test.mjs` 的 `file()` 函数。
- 升级：未升级。

## L-06 刚选完 Vault 文件夹，第一次收藏就报「授权已失效」（2026-11-02）

- 现象：用户在设置页选好文件夹后去收藏，后台 `queryPermission({ mode: 'readwrite' })` 返回非 `granted`，退回下载；点「去授权」→「重新授权」后正常，之后关掉设置页、⌘Q 重启 Chrome 都不用再授权。
- 根因：未核实。用户记不清当时的先后顺序和弹窗选项；推测第一次选目录时只给了临时授权，重新授权时 Chrome 给了持久授权。
- 正确做法：保留「授权失效 → 退回下载 + 去授权」这条路，不假设授权一直有效；设置页在 `prompt` 状态时给「重新授权」按钮。
- 证据：证据目录 `2026-11-02-md-vault/`（`3.png` 授权失效卡片、`downloads-listing.txt` 18:20:43 退回下载、`vault-listing.txt` 之后的写入时间）；Chrome 进程启动时间 19:57:52 前后两次写入均成功。
- 升级：未升级。

## L-07 SVG foreignObject 栅格化时外部图片和网页字体全部丢失（2026-11-02）

- 现象：长图里回答的图片是空白框（只剩说明文字），公式换成系统字体、`≠` 显示成方框，脚本画的 canvas 空白。
- 根因：SVG 当图片画（`img.src = data:image/svg+xml`）时浏览器不加载任何外部资源，`<img src="https://…">`、`@font-face` 的 url 都不生效；canvas 复制节点只复制标签不复制画面。另外 `images.openai.com` 不给 CORS 头，内容脚本 `fetch` 直接失败。
- 正确做法：栅格化前把图片、用到且已加载的 `@font-face` 换成 `data:` 地址，canvas 换成 `toDataURL()` 的图片；同源资源内容脚本直接取，跨域图片交给后台按 `host_permissions` 取（只列需要的域名，不用 `<all_urls>`）。测试里用不带 CORS 头的路由模拟跨域图片，Playwright 的 `context.route` 能拦到扩展后台的请求。
- 证据：`tests/snapshot.test.mjs`「长图里有跨域图片、网页字体、脚本画的 canvas」（改前 14.70% 报红，改后 0.87%）；证据目录 `2026-11-02-m1-5-acceptance/answer-T2-修后.png`、`answer-T4-修后.png`。
- 升级：已写成测试（同上）。
