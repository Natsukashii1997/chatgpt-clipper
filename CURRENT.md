# 当前状态

更新：2026-11-04。M2 增强续：常浩从脑暴里选了 5 个功能（写一句、只收选中段落、整段对话、跳回原回答、改版自检），每个先出三版 UI。写一句（A 版）、改版自检（A 版）已做完并提交，zip 已重打。下一步：画「只收选中段落」「整段对话」「跳回原回答」的三版 UI。

## M2 增强续：收藏时写一句、改版自检（2026-11-04，Claude，用户选“写一句A，自检A”、看过开发计划后“按计划开工”、写一句真实页面“测试完了没啥问题”、看过后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-04 11:20`（约，看完计划后），本节写于 `2026-11-04 11:47`。★ 来由：常浩让脑暴插件创新点，选了 1、2、4、6、8 五个，要求每个先看三版 UI 再开发；本轮做进度卡上的两个（PRD FR-8、FR-9）。
- 改了哪些文件：`src/lib/why.ts`（新：笔记里「为什么存」的读写，只改文本）；`src/lib/vault.ts`（再收藏沿用旧笔记的 why；`saveWhy` 只改笔记）；`src/entrypoints/background.ts`、`src/lib/messages.ts`（新消息 `why`，save 结果带 `why`）；`src/lib/ui.ts`（进度卡输入框与「改」，打字或悬停不自动关；步骤黄色 `warn`、位置块黄底；`notice()` 黄色提醒）；`src/entrypoints/content.ts`（收藏时量页面字数和高度做两项检查；对话页 10 秒后没认出回答就提醒一次）；`src/lib/adapter.ts`（`inChat`、`SITE_NAME`、`answerChars`：不算界面行和公式读屏副本）；`src/lib/markdown.ts`（`buildNote` 的 `warn`：frontmatter `incomplete: true` + `[!warning]` 框）；`tests/snapshot.test.mjs`（3 个用例 + 模拟改版的 Claude 页）；`docs/PRD.md`（FR-8、FR-9、分期）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 30` / `ℹ fail 0`；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证各自报红：输入框按键不拦（传到页面）、再收藏不沿用、长图检查、字数检查、10 秒提醒，各 1 个失败。
- 验证：测试页（Playwright）；写一句：常浩在真实页面试过（截图里进度卡显示「测试 · 改」，回复「没啥问题」）。改版自检：只在测试页模拟改版验证过，真实页面无法主动触发；正常的 ChatGPT、Claude 测试页没有误报。
- 截图：三版预览与实装截图在会话笔记目录 `side-session-notes/local_091f3a6b-…/`（`写一句与改版自检-三版预览.html/.png`、`自检A-实装-收藏时.png`、`自检A-实装-丝带没挂上.png`，测试页内容）。
- 发布与回读：无需发布；提交后已 `npm run zip`（25.30 kB）。
- 与授权不一致之处、遗留问题、范围外发现：卡片标黄时也给「写一句」输入框（三版图里没画，按顺手处理）；标黄时卡片不自动关。阈值「一半」宁漏报不误报，公式很多或代码编辑器只渲染一部分的回答理论上页面字数偏多或偏少，未在真实页面量过。
- 本轮新坑：无。

## M2 支持 Claude 网页版（2026-11-03，Claude，用户“只需要 claude”“抓紧开始做 claude 的收藏”“按计划开工”；加 claude.ai 权限、思考过程不收、Artifact 只收卡片、插件改名「AI 回答收藏器」均为用户选定；已提交、无需发布）

- 时间：开工 `2026-11-03 16:40`（M1 提交后），本节写于 `2026-11-03 17:16`。来由：PRD 第 8 节 M2，只加 Claude、不做 Codex。
- 侦察：常浩建的测试对话 `https://claude.ai/chat/1a834298-9100-4af0-9f87-83d4237a84f0`（C1–C6，不私密），Claude in Chrome 只读脚本读结构，未点击、未碰输入框，滚动后还原，读完关标签页。结论见 [docs/recon/2026-11-03-Claude侦察记录.md](docs/recon/2026-11-03-Claude侦察记录.md)。
- 改了哪些文件：`src/lib/adapter.ts`（按域名选站点：`SITE`、`ANSWER_SELECTOR`、提问选择器；新增 `NOISE`=Claude 的思考过程行、按钮行、读屏标题；指纹去掉 `NOISE`；`MD` 拆成 ChatGPT 一份、Claude 在其上覆盖：Claude 没有的组件设成匹配不到，加 `artifact`/`artifactTitle`）；`src/lib/markdown.ts`（Artifact 卡片输出一行 `**Artifact：名称**（内容在原对话里）`；frontmatter `source`、`tags` 按站点）；`src/lib/snapshot.ts`（新增 `opts.drop`：去掉占位置的界面，外层高度改 auto 后重新量高）；`src/entrypoints/content.ts`（matches 加 `https://claude.ai/*`，快照传 `drop: NOISE`）；`wxt.config.ts`（显示名「AI 回答收藏器」、说明写 ChatGPT 或 Claude）；`tests/fixtures/claude-answer.html`（照侦察结构仿的一轮问答）；`tests/snapshot.test.mjs`（`describe('Claude 网页版')` 6 个用例）；`public/安装说明.txt`；`docs/PRD.md`（M2 决定）；`AGENTS.md`（recon 说明）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 27` / `ℹ fail 0`；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证各自报红：长图不去掉界面（2 个失败）、指纹不去掉界面（卸载再装回用例失败）、笔记不跳过界面（2 个失败）、不认 Artifact 卡片（2 个失败）。测试页行高要用整数，否则回答落在半像素上，逐像素对比多出约 1% 抗锯齿差异。
- 验证：测试页；真实页面 2026-11-03 17:29 常浩收藏 C1–C6，Claude 逐条看了 Vault 里的长图和笔记，发现笔记丢加粗（Claude 的 strong 字重 501，Q1），已修：`markdown.ts` 里 strong/b 比父元素重就算加粗，测试页 strong 改 501（不修时笔记用例报红），修后 `ℹ pass 27` / `ℹ fail 0`。已重新 `npm run zip`。
- 截图：无入库截图。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：Claude 笔记的标签用 `claude收藏`（ChatGPT 仍是 `chatgpt收藏`），是 Claude 按站点推的默认，常浩没明确说。未覆盖：深色模式、带图片的回答（图片域名未知，可能要加 host_permissions）、生成中的回答、真实长对话里行卸载后丝带重挂（测试页模拟过）。`naming.ts` 标题为空时的兜底名仍是「ChatGPT 回答」（实际总有提问兜底，未改）。
- 本轮新坑：无。

## M1 ⑤ 修完 P9、P15；打包发给别人、没接 Obsidian 只下载长图（2026-11-03，Claude，用户“按计划开工”；打包选 zip + 安装说明、没接 Obsidian「只下长图」、P9/P15「现在就开始，一起打包」、进度卡「就原来进度卡的形式，补上这种情况」；未提交、无需发布）

- 时间：开工 `2026-11-03 10:56`（接下一节的断点）。★ 来由：做完 P9、P15；用户要求打包发给别人用，对方没装 Obsidian 时提示无法保存、长图下载到 Chrome。
- 改了哪些文件：`src/lib/markdown.ts`（`readCodeEditors(answer, copyLine?)` 每行第一次读到时顺带复制，返回 `{ text, lines }`）；`src/entrypoints/content.ts`（快照前先读全代码、复制的行交给 `takeSnapshot`，MD 用同一份；没选 Vault 文件夹时只下载 answer.png，最后一步「无 Obsidian」，标题「无法保存，长图已下载」）；`src/lib/snapshot.ts`（下一节的展开、去滚动条，另加 `bottomMargin`：子元素穿出去的下外边距补到写死高度的元素上，见 L-12）；`tests/fixtures/card-answer.html`（卡片里放一个能纵向滚动的 pre 代码框）；`tests/snapshot.test.mjs`（`before` 先不选文件夹收藏一次取长图和卡片，再设测试文件夹收藏一次读笔记后清掉；`setVault` 抽成函数；没选文件夹用例改成只下载 1 个文件）；`docs/PRD.md`（形态改为可打 zip 发给别人、不上架；FR-5 补没选文件夹只下长图）；`public/安装说明.txt`（随包的安装说明）；`package.json`（`npm run zip`）；`docs/OPERATIONS.md`「打包发给别人」；`AGENTS.md` 导航加一行；`docs/LESSONS.md` L-12。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 21` / `ℹ fail 0`；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证各自报红：不展开（3 个失败）、不换成读全的行（只画出 45 行）、不去滚动条（宽块 22.72%）、不补外边距（3 个失败）、外层高度不改 auto（3 个失败）、没选文件夹仍全部下载（3 个失败）。
- 验证：测试页（Playwright 加载 `.output/chrome-mv3`）；`npm run zip` 生成 `.output/chatgpt-clipper-0.1.0-chrome.zip`（22.73 kB，`manifest.json` 在根目录，`安装说明.txt` 文件名带 UTF-8 标记）。真实页面 T1、T6 未复验（等常浩刷新插件后重收）；zip 未在另一台电脑上装过。
- 截图：进度卡预览 `no-obsidian-preview.png` 在会话临时目录，未入库；真实页面无。
- 发布与回读：无需发布；zip 由常浩自己发。
- 与授权不一致之处、遗留问题、范围外发现：`bottomMargin` 修的是改动前就有的问题（以前被长代码框的 16px 滚动条抵消），按验收标准「代码框下方内容不被压住」一起修了。未覆盖：代码框与另一张卡片左右并排时，展开后旁边卡片不跟着变高；CodeMirror 内部若写死最小高度，要靠真实页面复验。设置页提示里建议的文件夹 `00 待整理/ChatGPT收藏` 是常浩自己的习惯，别人用时可能不合适，未改。验收矩阵 P9、P15 待真实页面复验后再改。
- 真实页面复验（2026-11-03 16:13 常浩重收 T6）：长图 768×701，代码框没展开，只到第 20 行左右（笔记 333 行是全的）。Claude 只读打开测试对话查到：真实页面代码框外有一层网格，计算样式里网格行高是写死的 `430.875px`，展开后又被裁回去；测试页没有这层所以没报红。修法：`snapshot.ts` 展开时外层若是网格，`grid-template-rows` 改 `none`；测试页长代码框外加一层 `display:grid`（不修 3 个用例报红，修后 `ℹ pass 21` / `ℹ fail 0`）。在真实页面只读模拟（复制代码块、写计算样式、放页面外量高，量完删掉）：不修 481px、修后 6314px（= 代码 6264 + 框头 50）。已重新 `npm run zip`。T1 尚未重收；常浩决定不再重收复验（「我基本不会出现收藏这种代码长内容的情况」），矩阵 P9、P15 按测试页 + 真实页面模拟记为已修。
- 本轮新坑：L-12。

## M1 ⑤ 修 P9、P15（进行中，2026-11-03，Claude，用户选“现在修 P9、P15”、P9 选“展开全部代码”、看过分步计划后“按计划开工”；未提交、无需发布）

- 时间：开工 `2026-11-02 21:15`（同一会话接着做；本节写于 `2026-11-03 10:22` 上下文过半交接时）。来由：验收矩阵 P9（代码框里要滚动才看得到的部分不进长图）、P15（长图里代码框多出横向滚动条、内容上移）。
- 已定方案（用户确认）：长图里代码块中纵向滚动的代码框展开显示全部代码，长图因此比页面高；所有能滚动的区域在长图里只裁剪、不画滚动条。
- 改了哪些文件（未提交）：`src/lib/snapshot.ts`（抽出 `styler()`：`css(e)` 算计算样式串、`copy(el)` 复制并写样式；`takeSnapshot` 新增 `opts.codeLines`（编辑器 → 已写样式的全部行，用来换掉只渲染了一部分的行）；能滚动的元素加 `overflow:hidden`，代码块里纵向可滚的代码框改 `height:auto;max-height:none;overflow-x:clip;overflow-y:visible` 并把它外面各层 `height` 改 auto；有展开时用 shadow root 放页面外量 `measure()` 高度）；`tests/fixtures/card-answer.html`（第九节加横向可滚的 `#wide` 宽块）；`tests/snapshot.test.mjs`（`before` 里同一时刻量 `geo`：media、wide、panes（含 extra）；尺寸用例改为「高 = 回答高 + extra」；整页对比只比到第一个代码框；第十节按 extra 下移比；`pixelDiff` 加 `dyA`；新用例「120 行都画出来、宽块无滚动条」）。
- 测试：`npm run compile` 无报错；`node --test tests/*.test.mjs` 原样结果 `ℹ pass 17` / `ℹ fail 4`（预期中的断点：尺寸 11709 应为约 11725、第十节 13.68%、120 行用例、写入 Vault 用例长图前后两次不一致）。`node scripts/check-rules.mjs` 未跑。
- 剩余：① `src/lib/markdown.ts` 的 `readCodeEditors(answer, copyLine?)` 读每行时（第一次见到时）顺带 `copyLine(l)`，返回 `Map<编辑器, { text, lines }>`；`answerToMarkdown` 的 `opts.code` 改用 `.text`。② `src/entrypoints/content.ts`：快照前先 `const st = styler(); code = await readCodeEditors(el, l => st.copy(l))`，`takeSnapshot(el, { exclude, codeLines })`，MD 步骤复用同一份 `code`，不再滚第二遍。③ 查尺寸差 16px（11709 vs 11725）与第十节偏移；查写入 Vault 用例两次收藏长图不一致（测试页假编辑器滚过后保留的行变多，可能要让长图不依赖编辑器当前渲染了哪些行，接上①②后多半自愈）。④ 全绿后逐项反向验证（不展开、不换行、不去滚动条各自报红），跑 `check-rules`。⑤ 请常浩刷新插件重收 T1（24 行被框住）和 T6（312 行），看长图完整、无滚动条、高亮在、下方内容没被压住。⑥ 更新矩阵 P9、P15，写交接，等常浩说提交。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：风险——代码框若在横排或网格里，外层高度改 auto 可能拉高旁边的块，计划里说过测试页要加一个放在卡片里的代码框覆盖，尚未加。
- 本轮新坑：无。

## M1 ⑤ 修 S3 文件卡片 P14，改正第十节长图测试（2026-11-03，Claude，用户选“修 S3 文件卡片”，修后“已刷新并收藏”、看过结果后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-02 21:15`（同一会话接着做，没另记；本节写于 `2026-11-03 10:09`）。来由：上一节范围外发现②。
- 改了哪些文件：`src/lib/markdown.ts`（`card`：第一块本身是列表项时拆掉标记当卡片标题；`row`：列表项 + 短标签合成「标题（标签）」，整行只有 `pressable` 的不要；新增 `onlyPressable`、`isItem`）；`src/lib/adapter.ts`（`MD.pressable`）；`tests/fixtures/card-answer.html`（照 S3 结构加文件卡片）；`tests/snapshot.test.mjs`（文件卡片断言、禁止「下载模板包」「- - 」；看得见文字用例对行内按钮例外；第十节位置改为在同一时刻量相对回答的位置）；`docs/recon/2026-11-02-回答结构-转MD.md`、`docs/acceptance/M1-验收矩阵.md`（P14、P15）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 20` / `ℹ fail 0`（整页差异 0.90%，第十节 0.00%）；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；`npm run compile` 无报错。文件卡片断言改前报红，输出与 S3 问题相同；中途一次红灯是样例标题「V1.0」撞上禁止词「1.0」，已改样例。
- 验证：Claude 用 Claude in Chrome 只读打开 S1–S3 所在私人对话读文件卡片结构（未点击、未碰输入框，读完关标签页）；常浩刷新插件后重收 S3（10:08:52），Claude 核对：卡片标题 + 两行说明、「**SKILL.md**（主文件）」、各文件层级正确，按钮文字和「- - 」没有了，P1 层级不变。S1 未重收，规则改动对它的影响只有测试页覆盖。
- 截图：无新截图；修后笔记复制到证据目录 `2026-11-02-m1-5-acceptance/note-S3-文件卡片修后.md`（私人内容，不入库）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 第十节长图对比测试原先位置量错：回答和第十节的坐标分两次取，中间截基准图滚动过页面，实际比到了第十节上方约 100px 的代码框；已改为同一时刻量，并重新反向验证（去掉资源内嵌后 12.15% 报红）。P4、P5、P10 长图修复另有真实页面复验，结论不变。上一节把 2.40% 归因于小数像素不准确：比错区域是主因；但小数像素也有影响（撤掉行高取整后第十节 1.85%，取整后 0.00%），行高取整保留。② 新发现 P15：长图里能内部滚动的代码框多出横向滚动条、内容上移约半行（测试页上看到），未修。
- 本轮新坑：L-11。

## M1 ⑤ 修卡片小标题 P1，查 P2、P3，对比 S1–S3（2026-11-02 至 11-03，Claude，用户选“修卡片 P1–P3”，同意“只读结构”打开 S1–S3 所在私人对话并顺带比长图，修后“已刷新并收藏”，P2、P3“记为暂不修并提交”；已提交、无需发布）

- 时间：开工 `2026-11-02 21:15`（同一会话接着做，没另记；本节写于 `2026-11-03 09:40`）。来由：验收矩阵 P1–P3、S1–S3 的 DPR 2 长图未对比。
- 改了哪些文件：`src/lib/markdown.ts`（`underSubtitles`：卡片里整块只是一段加粗短字的当小标题，后面的块收到它下面，直到下一个小标题）；`tests/fixtures/card-answer.html`（照 S3 真实结构加带两个小标题的卡片，小字行高取整 22px 免得后面内容落在小数像素上）；`tests/snapshot.test.mjs`（P1 断言）；`docs/LESSONS.md`（L-10）；`docs/acceptance/M1-验收矩阵.md`。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 20` / `ℹ fail 0`（整页差异 0.85%，第十节 0.76%）；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；`npm run compile` 无报错。P1 断言改前报红，输出与 S3 的问题相同。
- 验证：Claude 用 Claude in Chrome 只读打开 S1–S3 所在私人对话三次（只读标签、数据属性、文字长度；滚动到 S1 截图；注入新打包的转换代码只读试跑；未点击、未碰输入框，读完都关了标签页）：表格单元格里没有图标（P2 只在测试页），没有网格后紧跟列表（P3 同），P1 的卡片结构与测试页样例一致；S1 长图顶部与页面截图目视一致，S1–S3 长图高度都是页面的 2 倍。常浩第一次重收 S3（2026-11-03 09:32）层级未变，原因是插件没刷新到 23:14 的构建（L-10）；刷新后重收（09:39:30），Claude 核对层级序列与页面试跑结果完全一致，小标题下的正文都已缩进。
- 截图：证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-02-m1-5-acceptance/`（`page-S1-顶部.jpg`、`answer-S1-顶部裁切.png`、`note-S3-P1修后.md`；含私人内容，不入库）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① P2、P3 未修，常浩定为暂不修（真实页面未出现，遇到再修）。② 范围外：S3 文件卡片（「4 个文件」那张）开头输出了一个空的列表项，且「主文件」层级不对、带出了「下载完整 Skill 安装包 查看 SKILL.md」按钮文字，未修。③ P9 仍未修。
- 本轮新坑：L-10。

## M1 ⑤ 修笔记小问题 P10–P12（2026-11-02，Claude，用户选“修笔记小问题”，三处写法都选推荐：公式卡片“公式 + 示例结果”、来源胶囊“站名放括号里”、无标题“用提问”，修后“已重新收藏”、看过结果后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-02 21:15`（同一会话接着做，没另记）。来由：验收矩阵 P10 笔记部分、P11、P12。
- 改了哪些文件：`src/lib/adapter.ts`（`MD.skip` 加网站小图标；新增 `MD.citation`、`MD.learning`、`MD.learningCaption`、`MD.learningInputs`；`answerTitle` 只认标题，不再取正文第一段）；`src/lib/markdown.ts`（`learning`：主公式独立块 + 示例结果；来源胶囊输出「（站名）」）；`src/entrypoints/content.ts`（无标题时用提问，最多 30 字）；`tests/fixtures/card-answer.html`（第九节加仿交互公式卡片、来源胶囊）；`tests/snapshot.test.mjs`（两条正文断言、禁止出现的词加「提供反馈」「1.0」「favicons」、无标题用提问的新用例）；`docs/recon/2026-11-02-回答结构-转MD.md`、`docs/acceptance/M1-验收矩阵.md`。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 20` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；`npm run compile` 无报错。改前正文用例与新用例报红；中途一次红灯是测试样例里公式的大括号多转义了一层，已改正。
- 验证：Claude 先用 Claude in Chrome 只读打开测试对话读交互卡片和来源胶囊的结构（未点击、未碰输入框，读完已关标签页）；常浩刷新插件后重新收藏 T2、T3、T5（23:06），Claude 从磁盘核对：T2 第四步为主公式独立块 + 三行示例结果；T3 三条链接后都是「（Chrome for Developers）」，无 favicons 外链；T5 文件夹自动改名为「2026-11-02 不用任何格式，用三段话介绍一下 Obsidian。」，title 同名，旧长名字文件夹已删。
- 截图：无新截图；修后笔记复制到证据目录 `2026-11-02-m1-5-acceptance/note-T2|T3|T5-P10-12修后.md`。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 无标题回答若提问也取不到，标题为空，文件夹名只有日期（与改前一致的兜底）。② 链接来源胶囊在长图里的小图标仍空白（google.com，未加权限）。
- 本轮新坑：无。

## M1 ⑤ 补测深色与长代码，修长代码缺行 P13（2026-11-02，Claude，用户选“补测深色和长代码”，长代码不通过后选“现在修”，同意把两份旧 T6 收藏“移到废纸篓”，修后“已收藏两次”、看过结果后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-02 21:15`（同一会话接着做，没另记）。来由：验收矩阵第 8 行深色模式和长代码未测。
- 改了哪些文件：`src/lib/markdown.ts`（`readCodeEditors`：有占位块的编辑器逐段滚动代码框读全、每段等可见范围里没有占位块再读、还原滚动位置；`codeLines` 只取编辑器直接子元素里的代码行；整篇合并连续空行时跳过代码块 `FENCE`）；`src/lib/adapter.ts`（`MD.codeLine`；回答指纹不算代码编辑器里的文字）；`src/entrypoints/content.ts`（转 MD 前读全长代码）；`tests/fixtures/card-answer.html`（120 行假编辑器：只渲染可见附近的行、100ms 后才补行、滚过的行回顶部后保留；两种代码块各加连续两个空行）；`tests/snapshot.test.mjs`（长代码与连续空行断言）；`docs/LESSONS.md`（L-08、L-09）；`docs/recon/2026-11-02-回答结构-转MD.md`、`docs/acceptance/M1-验收矩阵.md`。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 19` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；`npm run compile` 无报错。新断言改前报红；反向验证三次：不读全长代码（报「笔记里缺少：x1 = 1…」）、只等两帧、指纹算上编辑器文字（写入 Vault 用例报红），还原后通过并重新构建。
- 验证：深色——常浩切深色后重收 T1、T2、T4（22:12），Claude 看了三张长图并只读打开测试对话核对：页面深色背景就是 `rgb(0,0,0)`，长图背景同色、不透明，代码高亮、公式、函数图、照片都是深色版。长代码——常浩发 T6 收藏（22:18，66 行）；Claude 只读打开对话确认编辑器只渲染 36 行 + `cm-gap`，在页面里试逐段滚动拿到 312 行；第一次修后重收 299 行且新建「(2)」，Claude 按每行长度序列对比页面与笔记，定位到缺的是连续空行的第二个；常浩同意后两份旧 T6 文件夹移到废纸篓；最终修后常浩收藏两次（22:41:39），只有一个文件夹，代码 312 行，逐行长度与页面一致。以上浏览器操作均只读（脚本读结构、滚动代码框后还原、截图），未点击、未碰输入框，读完关标签页。
- 截图：证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-02-m1-5-acceptance/`（`page-T2-深色.jpg`、`answer-T1/T2/T4-深色.png` 与 `-浅色.png`、`T6-修后/`）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 第一次修长代码时把 299 行误判为补行慢，加了「等补完再读」；真实页面不需要等，真正原因是空行合并（L-09），等待逻辑保留作防护。② 指纹改了算法：含代码编辑器的旧收藏（T1）再收藏会另建一份，其他回答不受影响。③ 代码框需要滚动才看得到的部分仍不在长图里（P9）。
- 本轮新坑：L-08、L-09。

## M1 ⑤ 修长图的图片和公式 P4、P5、P10（2026-11-02，Claude，用户选“修图片和公式”，新增图片域名权限选“加两个 OpenAI 图片域名”，修后“已重新收藏”、看过结果后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-02 21:15`（同一会话接着做，没另记）。来由：验收矩阵 T2 公式长图、T4 图片长图不通过。
- 改了哪些文件：`src/lib/snapshot.ts`（canvas 换成 `toDataURL()` 图片；新增 `embedResources`：图片换 data: 地址，同源直接取、跨域交给后台；用到且已加载的 `@font-face` 内嵌成 data: 字体）；`src/entrypoints/background.ts`（`image` 消息：只取 `images.openai.com`、`*.oaiusercontent.com` 的 https 图片，转 data: 地址）；`src/entrypoints/content.ts`（出 PNG 前调 `embedResources`）；`src/lib/messages.ts`（`image` 消息与 `dataUrl`）；`wxt.config.ts`（`host_permissions` 两个图片域名）；`README.md`（权限表）；`tests/fixtures/card-answer.html`（第十节：不带 CORS 头的跨域图片、同源网页字体、脚本画的 canvas）；`tests/snapshot.test.mjs`（对比函数抽成 `pixelDiff`，可只比一块；第十节区域对比；路由放行字体、图片）；`docs/LESSONS.md`（L-07）；`docs/recon/2026-11-02-回答结构-转MD.md`、`docs/acceptance/M1-验收矩阵.md`。没加依赖。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 19` / `ℹ fail 0`（整页差异 0.70%，第十节 0.87%）；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；`npm run compile` 无报错。新用例改前报红（第十节 14.70%）；反向验证：临时去掉 `embedResources` 调用，第十节 13.02% 报红，还原后通过并重新构建。
- 验证：Claude 先用 Claude in Chrome 只读打开测试对话，读 KaTeX `@font-face` 来源与加载状态、图片在页面里能否 `fetch`（失败，无 CORS 头），未点击、未碰输入框，读完已关标签页。常浩刷新插件后重新收藏 T2、T3、T4（21:57:25–21:57:44），Claude 看了三张长图：公式是 KaTeX 字体、`≠` 正常、函数图在；4 张照片都在；T3 除网站小图标空白外与修前一致。
- 截图：证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-02-m1-5-acceptance/`（`answer-T2-修后.png`、`answer-T3-修后.png`、`answer-T4-修后.png`，测试对话内容不私密，仍按规矩不入库）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 链接后来源胶囊里的网站小图标来自 google.com，没加权限，长图里仍空白。② 笔记里的图片仍是外链（P5 MD 部分）；交互卡片的笔记仍杂乱（P10 MD 部分）。③ 发现快照老限制：每个元素写死高度，子元素下外边距不能穿过父元素合并，测试页里绕开了，真实页面暂未见影响（记在矩阵末尾）。④ T4 长图 3.6MB（四张照片按原分辨率内嵌后再栅格化）。
- 本轮新坑：L-07。

## M1 ⑤ 修代码块笔记 P7、P8（2026-11-02，Claude，用户看过矩阵后选“先修代码块”，修后“已重新收藏”、看过结果后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-02 21:15`（同上一节，同一会话接着做，没另记）。来由：验收矩阵 T1 代码块笔记不通过。
- 改了哪些文件：`src/lib/adapter.ts`（`MD.codeBlock`、`MD.codeEditor`、`MD.codeBlockLang`：认 ChatGPT 代码块，语言取 `data-language` 或块头文字）；`src/lib/markdown.ts`（`codeBlock`：代码编辑器逐行取，否则取 pre；`fence` 可传语言，抽出 `fenced`）；`tests/fixtures/card-answer.html`（照 T1 真实结构加 Python 编辑器块和 Bash pre 块，含 `#` 注释和空行）；`tests/snapshot.test.mjs`（两条断言）；`docs/recon/2026-11-02-回答结构-转MD.md`（补代码块结构）；`docs/acceptance/M1-验收矩阵.md`（第 4 行、P7、P8）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 18` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；`npm run compile` 无报错。新断言在改代码前报红（`笔记里缺少：```python…`），改后通过。
- 验证：Claude 先用 Claude in Chrome 只读重开测试对话读代码块块头结构（未点击、未碰输入框，读完已关标签页）；常浩刷新插件后重新收藏 T1（21:44:34 覆盖写入），Claude 从磁盘读笔记：Python、Bash 都是带语言标记的代码块，24 行齐全，缩进、空行正确，`#` 注释不再变标题。
- 截图：无新截图（证据为 Vault 里的笔记，测试对话内容不私密）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 长代码（编辑器可能只渲染可见的一段）未验证。② P9 代码框内部滚动导致长图少行，属长图，留第二批。
- 本轮新坑：无。

## M1 ⑤ 验收矩阵：第一轮对比（2026-11-02，Claude，用户同意分批计划“按计划开工”，自己发了 5 条测试提问并收藏后说“都测试过了”、后与代码块修复一起“提交”；已提交、无需发布）

- 时间：开工 `2026-11-02 21:15`（`date '+%F %H:%M'` 记录）。来由：PRD 第 7 节验收矩阵，M1 ⑤。
- 改了哪些文件：新建 `docs/acceptance/M1-验收矩阵.md`（10 类加高清屏一行、样本代号、问题清单 P1–P12）；`AGENTS.md` 导航表和结构各加一行指向它。没改代码。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 18` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`（只改了文档，代码未动）。
- 验证：从磁盘读 Vault 里 T1–T5 的笔记和长图（21:33–21:37 写入）及 S1–S3 笔记结构；Claude 用 Claude in Chrome 新开标签页只读打开测试对话（DPR 2、窗口 1414 宽、浅色），用脚本读各回答高度和结构、截了 3 张图，未点击、未碰输入框，读完已关标签页。五条回答高度 1082、1940、337、867、448px，长图正好都是 2 倍，DPR 2 尺寸正确。页面结构新发现：可运行代码块是 `[data-client-defined-widget="code_block"]`，Python 用代码编辑器 `.cm-content[data-language=python]`、一行一个 `.cm-line`，Bash 是 `pre > code` 无语言类、语言写在块头；代码框内部滚动 431/504px；交互公式卡片是 `[data-client-defined-widget="learning_block"]`，函数图是 canvas；搜索图片是 `data-d-component="image"`，图片来自跨域 `images.openai.com`（直接请求返回 200）；链接后的来源胶囊是 `badge` 里的 `favicon`。
- 截图：证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-02-m1-5-acceptance/`（`page-T1-代码块.jpg`、`page-T2-公式卡片.jpg`、`page-T4-图片.jpg`；截图带侧栏里的私人对话标题，不入库；`样本对照.md` 记 S1–S3 对应哪条私人对话）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 不通过：代码块 MD（P7、P8）、公式长图（P4、P10）、图片长图（P5）；部分通过的问题见矩阵 P1–P3、P9、P11、P12。② 深色模式没收（T1、S1 的文件时间没变），待测。③ S1–S3 所在的私人对话没让我看，它们的 DPR 2 长图未与页面对比（M1 ② 在 DPR 1 比过一致，长图代码之后没改）。
- 本轮新坑：无。

## 修卡片流程图层级（2026-11-02，Claude，用户说“接着修层级”、看过验证结果后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-02 21:03`（估计值：本轮开工时没用 `date` 记录，按会话里前后命令的时间推算）。来由：上一轮遗留①，流程图外层大框没有标题时，第一步被当成小标题，后面各步缩进到它下面。
- 改了哪些文件：`src/lib/markdown.ts`（带边框的框只有第一个子元素是文字时才取标题，第一个子元素是另一个框时视为外框、内容平铺；无边框、只装文字、第一块是一行短字的框当小卡片：标题加粗、说明缩进一级）；`tests/fixtures/card-answer.html`（按真实结构加一个流程图样例：外框 + 无边框小框 + 带边框步骤 + 分支网格 + 收尾）；`tests/snapshot.test.mjs`（断言各步平级、各自带说明）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 18` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；`npm run compile` 无报错。反向验证：去掉外框规则后结构用例报红，还原后全绿。
- 验证：用户刷新插件后重新收藏「亚古兽 · 管培带教 Skill 设计方案 V1.0」（21:09），Claude 从磁盘读笔记：流程图各步平级、各带说明，「匹配问题类型与回答深度」变为标题 + 说明；全文扫过无空条目、无异常加粗。用户另收藏了一条新回答「Hermes 双数字分身系统 · 最终架构方案 V3.0」（文档块，直接用原文，标题与表格正确，但不含卡片，验证不了外框规则）。「Hermes Digital Twin · 双数字分身架构方案 V1.0」未重新收藏，未复验。
- 截图：无（只读磁盘上的笔记，含私人内容，不入库）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 卡片里有小标题时（如「示例提问」卡片里的「1. 当前判断」），小标题和它的正文排在同一级，正文没缩进到小标题下（文字不缺）。② 上一轮遗留②③④⑤⑥⑦仍在。
- 本轮新坑：无。

## M1 ③④：Markdown 笔记 + 写入 Vault（2026-11-02，Claude，用户同意分批计划“按计划开工”、重复收藏选“直接覆盖 / 已挪走则提示不写”、真实页面侦察“同意”、进度卡三版里选“用 B 版”、插件图标三版里选“用 A 版”、看过后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-02 18:13`（`date '+%F %H:%M'` 记录）。来由：用户要收藏内容能被 Obsidian 搜索和知识库调用，PNG 里的字检索不到，所以本轮做笔记并直接写进 Vault。
- 改了哪些文件：新建 `src/entrypoints/options/`（设置页：选文件夹、重新授权，只显示文件夹名，浏览器不给完整路径）、`src/lib/vault.ts`（目录句柄存 IndexedDB、授权状态、同名加序号、「已收藏」清单：回答指纹 → 文件夹名与笔记名，不存正文；`saveCollection`：同一条回答覆盖原文件夹，文件夹名里的标题和现在应有的不同且里面只有插件写的长图和一篇笔记时改成新名字、沿用原日期，标题变了时删掉旧名字的笔记）、`src/lib/markdown.ts`（回答 DOM → Markdown，整篇笔记模板）、`tests/vault.test.mjs`（起名加序号）、`docs/recon/2026-11-02-回答结构-转MD.md`（真实页面结构侦察与转换规则）、`scripts/icon.svg` 与 `scripts/make-icons.mjs`（插件图标 A 版：橙底白书签加勾，用已装的 Playwright 渲染成 `public/icon/16|32|48|128.png`，WXT 自动写进 manifest）；改 `src/entrypoints/background.ts`（写 Vault、查已收藏、打开设置页，失败返回原因代码）、`src/entrypoints/content.ts`（四步：快照 → PNG 文件 → MD 文件 → 入库（步骤名按用户要求），标题不再截到 40 字，写不进 Vault 退回下载并给「去设置 / 去授权」；丝带按已收藏清单显示绿色，回答文字变化后重查）、`src/lib/adapter.ts`（回答指纹、取提问、转 MD 用的页面标记 `MD`）、`src/lib/naming.ts`（文件夹名去掉时分改为「日期 标题」，标题上限 30 字放宽到 60 字（用户反馈名称显示不全），加笔记文件名）、`src/lib/messages.ts`、`src/lib/ui.ts`（进度卡改为 B 版：顶部是收藏状态（收藏中… / 已收藏 / 已更新 / 已收藏过 / 已存到下载目录 / 收藏失败，用户选定，避免与底部标题重复），四步横排成进度线、每步一个短结果、底部「存到哪里」色块带操作按钮（成功时第一行回答标题、第二行「日期 · 收藏文件夹」，用户要求日期单独一行），宽 280px，路径只出现一次；已收藏丝带更显眼）、`wxt.config.ts`（说明文字）、`README.md`（权限表、首次使用、代码结构）、`tests/fixtures/card-answer.html`（按真实 `data-d-component` 结构仿写卡片，新增第九节格式样例，内容是编的）、`tests/snapshot.test.mjs`、`tests/naming.test.mjs`；`docs/PRD.md` FR-5 补「同一条回答再收藏」规则、第 8 节进度；`docs/LESSONS.md` 追加 L-04 至 L-06。没加权限，没加依赖。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 18` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；`npm run compile`（tsc）无报错。写入测试用扩展自己的 OPFS 目录代替 Vault（测试里弹不出选目录窗口）。笔记断言覆盖 frontmatter、折叠提问、长图嵌入、卡片、DIL 列表、嵌套列表、无 thead 表格（单元格多段、竖线转义）、带语言代码块、行内与块级公式源码、链接、引用、文件引用、文档块原文，另有「看得见的文字一个不少」断言。反向验证四次：去掉加序号、让插件认不出同一条回答、关掉卡片规则、关掉改名，各自对应用例报红，还原后全绿；「内容晚到」用例在修复前报红（L-04）。
- 验证：用户在自己的 Chrome 里加载 `.output/chrome-mv3/`，设置页选 `Obsidian Vault/00 待整理/ChatGPT收藏`（Claude 先建好该文件夹）；Claude 从磁盘核对写入时间。结果：写入 Vault、同名加序号、覆盖更新都正确；关掉设置页、⌘Q 重启 Chrome（进程启动 19:57:52）前后两次收藏都直接写入，授权持久；首次出现过一次「授权已失效」，重新授权后不再出现（L-06，根因未核实）。收藏过的丝带刷新后为绿色（L-04 修复后用户确认）。真实页面结构由 Claude 用 Claude in Chrome 只读标签、数据属性、层级（新开标签页，读完已关，未点击、未碰输入框）。用户重新收藏一条卡片回答，进度卡四步全绿、「已更新」；用户看过 B 版进度卡真实效果，反馈文件夹名被截断、步骤改名，均已改，Vault 里有笔记（129 行，frontmatter、提问正确，无「ChatGPT 说」「打开文件」）和长图；用户在 Obsidian 里确认笔记显示的是本文件夹的长图（Vault 里另有 4 个同名 `answer.png`，`![[answer.png]]` 按同文件夹解析）、正文可读。
- 截图：证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-02-md-vault/`（`1.png`–`9.png` 用户截图、`vault-listing.txt`、`downloads-listing.txt`、`fixture-note.md` 测试页生成的笔记；含私人对话，不入库）；设置页无三版（用户确认不用）；进度卡三版预览与 B 版实装截图、插件图标三版预览在会话笔记目录 `side-session-notes/local_846b1737-…/`（`进度卡三版预览.html/.png`、`进度卡B版-实装.png`、`插件图标三版预览.html/.png`，测试页内容）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 卡片流程图层级不准：外层带边框的大框没有标题时，框里第一步被当成小标题，后面各步缩进到它下面（文字不缺，用户已知，留待下轮）。② 表格里用图标表示的内容（如星级）在笔记里是空格。③ 公式、代码块、链接在真实页面没遇到，只在测试页验证。④ 卡片网格后紧跟列表时，两段在 Markdown 里会连成一个列表。⑤ Vault 里留有本轮改动前存的旧收藏（`Hermes 双数字分身架构方案 V2.0` 与 `(2)` 两份、其余只有长图没有笔记），用户可重新收藏或自行清理；用户同意后已把一份多余的 `(2)` 移到废纸篓。⑥ 下载目录里退回下载的文件由用户自行清理。⑦ 「完成后可点开」未做（浏览器不给 Vault 完整路径）。⑧ 放宽前收藏的「…双数字分身架构方」文件夹：用户再收藏后仍是截断名（当时只覆盖不改名），已补「标题变了就改名」；用户刷新插件再收藏后，磁盘上该文件夹已改为「2026-11-02 Hermes Digital Twin · 双数字分身架构方案 V1.0」（21:00:58），里面是笔记和长图，旧文件夹已删。用户看过新图标与进度卡顶部状态后同意提交。
- 本轮新坑：L-04、L-05、L-06。

## M1 ②：插件骨架 + 收藏按钮（2026-11-02，Claude，用户选定 UI 方案三并同意“按推荐开工”，后决定“只留 PNG”“先提交 M1②，新会话做”；已提交、无需发布）

- 时间：开工 `2026-11-02 17:29`（`date '+%F %H:%M'` 记录）。来由：PRD 第 8 节 M1 ②，用 WXT + TypeScript 搭正式插件，点「收藏」用方案 C 生成长图，先走浏览器下载。
- 改了哪些文件：新建 `package.json`、`package-lock.json`、`wxt.config.ts`（权限只要 `downloads`）、`tsconfig.json`、`.gitignore`、`README.md`（构建、加载、测试、每项权限的用途）；`src/entrypoints/content.ts`（挂丝带、串起快照 → 长图 → 下载，失败时已生成的照样下载并标不完整）、`src/entrypoints/background.ts`（调 downloads）、`src/lib/adapter.ts`（选择器唯一出处，只用 `data-chatgpt-search-unit-key`）、`src/lib/snapshot.ts`（从原型 `shotC` 移植：内联计算样式 → SVG foreignObject → PNG，排除插件自己的节点，去脚本与事件属性，超 32767px 降像素比）、`src/lib/ui.ts`（方案三：左侧书签丝带 + 右下角进度卡，Shadow DOM）、`src/lib/naming.ts`（北京时间与下载子文件夹名）、`src/lib/messages.ts`；`tests/fixtures/card-answer.html`（自建仿卡片测试页，内容是编的）、`tests/snapshot.test.mjs`（Playwright 带插件端到端）、`tests/naming.test.mjs`；`scripts/check-rules.mjs` 的 `ALLOWED_DEPS` 加 `wxt`（构建）、`typescript`（类型检查）、`playwright`（带插件跑测试页），均为开发依赖；`docs/LESSONS.md` 追加 L-03；`docs/PRD.md` 第 2、4、5、6、7、8、9 节改为「一张长图 + 一篇笔记」（FR-3 离线 HTML 标为用户决定不要）及 M1 进度。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 11` / `ℹ fail 0`（端到端：测试页回答 768×6108，PNG 与 Playwright 元素截图差异像素 0.48%，阈值 3%；丝带不出裁剪容器；标题跳过隐藏标题；去掉 HTML 前为 13 项，含 HTML 断网 0 请求）；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；`npm run compile`（tsc）无报错；`npm run build` 产出 `.output/chrome-mv3/`。反向验证：临时去掉 L-01 的边框写全，差异像素升到 24.00%，测试报红，已还原。
- 验证：用户移除原型插件、在自己的 Chrome 加载 `.output/chrome-mv3/`；Claude 用 Claude in Chrome 打开用户指定对话（窗口 1028×749、DPR 1），只对两条回答点「收藏」，未碰输入框、未发消息。样本键已平移（L-03）：卡片回答现为 `fallback-turn-2:3:assistant`，长文现为 `fallback-turn-3:2:assistant`。结果：PNG 625×4144（0.4s）、625×9292（0.7s），与页面上回答尺寸一致；长图顶部、底部与页面截图逐行目视一致；两个 HTML 用 Playwright 断网打开，外部请求 0、脚本 0、尺寸 625×4144 / 625×9292、文字可选中。验证中发现并已修：① 丝带画在回答左侧 -40px，被 ChatGPT 外层 `overflow-x: clip` 容器裁成一条细线（回答左侧只有 20px 空白），改为 16px 宽、收进空白里；② 标题取到读屏专用的隐藏标题「ChatGPT 说：」，改为取第一个看得见的标题。两处都补进测试页和断言。用户看过 HTML 后决定只留 PNG（HTML 在 Obsidian 里不显示、文字也检索不到，检索交给 MD），已删 HTML 产出，进度改为三步。用户重新加载后复验（窗口约 1512 宽，编号又平移一次）：丝带 16×44 完整显示在回答左侧空白里，悬停变实变长；用户收藏一条 2037px 回答，进度卡标题为正文标题、三步全绿，下载目录只有 `answer.png`（768×2037）。
- 截图：证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-02-m1-2-real-page/`（`sample*-answer.png/html` 产物、`sample*-crop-*.png` 长图裁切、`sample*-html-offline.png` 断网打开、`page-0*` 原页面与丝带修正前后；含私人对话，不入库）；三版 UI 预览在会话笔记目录 `m1-2-收藏按钮三版预览.html`（示例内容）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：下载原件仍在用户 `~/Downloads/chatgpt-clipper/` 下（含修复前的「ChatGPT 说：ChatGPT」文件夹和旧版 HTML，由用户自行清理）；同一分钟收藏两条同名回答会进同一文件夹、文件名被加「(1)」，未处理；PNG 按屏幕 DPR 出图，Retina（DPR 2）未在真实页面测；长图里的图片内联、公式字体、伪元素、深色模式未做；端到端测试依赖 `npx playwright install chromium`（约 150MB）；项目仍无 GitHub 远端，本轮直接在 main 上改。
- 本轮新坑：L-03。

## M1 原型①：比较三种长图截取方案（2026-11-02，Claude，用户同意“开始原型 ①”；已提交、无需发布）

- 时间：开工 `2026-11-02 16:58`（`date '+%F %H:%M'` 记录）。来由：PRD 第 5 节长图是最大的技术风险，先用一次性原型比较三种方案。
- 改了哪些文件：新建 `prototypes/long-shot/`（manifest、bg.js、content.js、README、compare.py，一次性原型）、`docs/recon/2026-11-02-原型1-长图.md`（结果与决定）；`docs/PRD.md` 第 5 节长图方案改为 C，第 8 节 M1 进度、第 9 节第 3 条补注；`docs/LESSONS.md` 追加 L-02。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 4` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`；原型代码 `node --check` 通过；`compare.py` 对比 A 与 C：turn-3 尺寸一致、差异像素 5.6%，turn-4 尺寸一致、差异像素 4.3%，全部为字形抗锯齿差异。
- 验证：用户在自己的 Chrome 里加载原型插件；Claude 通过 Claude in Chrome 打开用户指定对话，在页面面板上对两条长回答（3850px、9058px）跑 A、C，B 因权限报错未跑通；结果目视核对并排图。
- 截图：证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-02-proto1-long-shot/`（含私人对话，不入库）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：B 方案只跑到报错，根因未核实（L-02）；C 方案的图片内联、公式字体、伪元素、深色模式、DPR 2 未覆盖，已列入原型记录；测试时该对话里正有一条新回答在生成，原型只操作已有回答，未碰输入框；原型插件仍装在用户 Chrome 里，建议用户在 `chrome://extensions` 移除。
- 本轮新坑：L-02。

## 项目起步：铺协作骨架 + PRD v2 + M0 侦察记录（2026-11-02，Claude，用户同意“按计划建”；本地已提交、无远端、无需发布）

- 时间：开工 `2026-11-02 16:33`（`date '+%F %H:%M'` 记录）。来由：用「项目起步」（agent-kit 的 `skills/project-starter`）铺协作骨架。
- 改了哪些文件：新建 `AGENTS.md`（入口与导航表）、`CURRENT.md`（本文件）、`docs/LESSONS.md`（坑的写法与三级升级）、`docs/OPERATIONS.md`（交接写法、报告与验收）、`docs/templates/handoff.md`（交接骨架）、`tests/handoff-format.test.mjs`（交接格式测试）、`scripts/check-rules.mjs` 与 `tests/check-rules.test.mjs`（通用规则检查及自测）；另新建 `docs/PRD.md`（需求 v2）、`docs/recon/2026-11-02-侦察记录.md`、`docs/reference/gpt-prd-v1/`（GPT 原 PRD 的 md、两份说明和参考图，docx 未收）、`docs/LESSONS.md` 追加 L-01；`scripts/check-rules.mjs` 保持骨架原样（`SCAN` 本就含 `src`，曾改为只扫 `src`，但自测用例写死了 `server/` 样本，故还原）；目录原本不存在，无冲突。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ tests 4` / `ℹ pass 4` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`。
- 验证：只铺文档与测试，无界面。
- 截图：侦察截图 3 张在证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-02-recon/`（含私人对话，不入库）。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：GitHub 仓库未建（按计划先不建，`docs/agents/issue-tracker.md` 已注明），因此分流标签也未建；PRD 第 9 节三条默认取舍用户尚未逐条确认；未在 `digital-twin/projects.json` 登记本项目（属另一项目文件，待用户决定）。
- 本轮新坑：L-01。
