# 当前状态

当前阶段目标：一键导出 PDF 给 AI（FR-15），分三批：① 删「为什么存」② 导出 PDF ③ 常浩真实 Chrome 验收。（2026-11-10 常浩确认）已完成，2026-11-11 合并（#5）。

更新：2026-11-19。FR-9 改成「插件更新后给已开页面补装脚本」（#12，常浩选「只补装」、同意加 scripting 和两个站的 host 权限），PR 待合并。下一步：常浩合并后，在真实 Chrome 里重新加载插件、不刷新已开的 ChatGPT 页面点丝带收藏一次。之前的生成图片修复（#9）、FR-15、FR-9 C 版已合并。


## 插件更新后给已开页面补装脚本，不用刷新（FR-9「只补装」）（2026-11-19，Claude，常浩选「换个改法（只补装）」，又同意加 chatgpt.com、claude.ai 两个站的 host 权限；已提交、PR 待合并，未发布）

- 时间：开工 `2026-11-19 16:07`。★ 来由：积压清单组 7（全局 G-35），碰到 FR-9 已定内容，按第 15 节问过（#12）：常浩选「只补装，补装失败仍提醒刷新，第一次升级的两条丝带接受」。
- 改了哪些文件：`src/entrypoints/background.ts`（`runtime.onInstalled` 安装、更新时按 `PAGES` 查已开标签页，`scripting.executeScript` 补装 `content-scripts/content.js`，失败的只记日志）；`src/entrypoints/content.ts`（`main(ctx)`：新的一份启动时 WXT 让旧的作废，旧的断开监听、清计时、收起自己的 `[data-clipper-ui]`；选区监听改用 `ctx.addEventListener`）；`src/lib/messages.ts`（`PAGES` 一处定义，内容脚本和后台共用）；`wxt.config.ts`（加 `scripting` 和两个站的 host 权限，注释写明来由）；`tests/snapshot.test.mjs`（浏览器带真重载开关；新用例「插件更新或重新加载后，已开的页面不用刷新…」；原兜底用例改名、取最新服务进程）；`docs/PRD.md` FR-9 末句；`docs/LESSONS.md` L-13、L-21 补充，新增 L-24；`README.md` 权限表；`public/安装说明.txt`「更新」一段。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 55` / `ℹ fail 0`，连跑三遍一致（证据目录 `2026-11-19-fr9-reinject/full-1-summary.txt`、`full-2.txt`，文档定稿后最终版 `full-3-final.txt`）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证：旧代码下新用例报红「补装后不该再提醒」（`red-old-code.txt`）；只加 scripting 不加 host 权限仍红（`green-new-code.txt`）；去掉让位逻辑报红（同一条回答两套丝带，`red-without-stepdown.txt`）。
- 验证：Playwright Chromium（无头），浏览器级 CDP `Extensions.loadUnpacked` 真重载（同扩展页「重新加载」）；没在常浩的真实 Chrome 里试。
- 截图：无（界面没变，只是不再出提醒）。
- 发布与回读：未发布；合并后 `npm run zip`。
- 与授权不一致之处、遗留问题、范围外发现：① 常浩原批只说加 `scripting`，做的时候发现补装还要两个站的 host 权限（L-24），停下单独问过，常浩回「加两个站权限」。② 从本版之前的版本第一次升上来那一次，旧脚本不认让位，已开页面可能两条丝带、旧的还会提醒刷新，刷新一次后正常（常浩选的就是不处理这一情形）。③ 顺手改：README 权限表原来写「不要 debugger」、只列 chatgpt.com，已和现状对齐。④ 范围外：AGENTS「分工」还写「范围外的问题记进交接，不顺手修」，与全局第 3 节「代码库归你」不一致（骨架 0.3.1 已改），没动。⑤ 本项目没有 `docs/DECIDED.md`，要不要建由常浩定。
- 本轮新坑：L-24。

## 生成图片的回答认不出：重新侦察，选择器补上这类回答（2026-11-18，Claude，常浩贴来插件复制的修复请求，要求重新侦察、改 adapter.ts；常浩刷新插件试过后说「试过了，提交」；已合并 PR #9（`ea687b9`）、无需发布）

- 时间：开工 `2026-11-18 21:44`（约）。★ 来由：常浩在一个 chatgpt.com 对话页看到「ChatGPT 改版了」提醒，修复请求写回答选择器 0 个、提问 2 个，界面标记里有 `generated-image-gallery`。
- 改了哪些文件：`src/lib/adapter.ts`（`ANSWER_SELECTOR` 加上「带消息编号、不在 `…:assistant` 里面的 `data-response-body`」；ChatGPT 的 `NOISE` 加上生成图片上的「编辑」「分享」按钮；`answerKey` 没有单元标记时用消息编号；`MD.keepButton`：生成图片的预览按钮）；`src/lib/markdown.ts`（按钮一律不转，`MD.keepButton` 例外，图片说明才进得了笔记）；`tests/fixtures/image-answer.html`（新：仿生成图片对话，两问两答，图片是 blob: 地址，图上叠按钮）；`tests/snapshot.test.mjs`（新 `describe('ChatGPT 生成图片的回答')` 3 个用例；改版自检用例里修复请求的选择器那行跟着改）；`docs/recon/2026-11-18-生成图片回答侦察记录.md`（新）；`docs/LESSONS.md`（L-23）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 53` / `ℹ fail 0`（证据目录 `2026-11-18-生成图片-全量测试.log`）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。改代码前新用例报红「waiting for locator('#second clipper-ribbon')」超时（`2026-11-18-生成图片-改前红.log`）；中途没加 `keepButton` 时笔记用例报红（正文为空），未另存日志。中途：Playwright 浏览器缓存又不在了（L-16），`npx playwright install chromium` 装回。
- 验证：Claude in Chrome 只读看了常浩 Chrome 里 4 个对话的结构（没读对话文字）：普通对话回答标记都在，只有生成图片的回答换了结构（详见侦察记录）。新选择器在真实页面上核过：生成图片对话认出 2/2，3 个普通对话新旧选择器命中完全相同（5/5、2/2、1/1），没有重复认出；图上按钮选择器只命中「编辑」「分享」4 个、不碰预览按钮。看完已关标签页。测试页（Playwright Chromium，无头）：两条回答都挂丝带、不提醒改版，长图和藏起按钮的真实渲染逐像素比通过（blob 图片嵌进去了），笔记提问是同一轮的、正文是「已生成图像 1」、没有按钮文字。真实 Chrome：常浩刷新插件后试过，回复「试过了，提交」（试了哪条回答、长图和笔记里图片是否正常没说明；内容脚本能读页面建的 blob 地址，按此推断成立）。
- 截图：无（没有界面改动；真实页面截图含私人图片，未存）。
- 发布与回读：未发布，无需发布；`npm run build` 已由测试跑过，未 `npm run zip`（等提交时一起）。
- 与授权不一致之处、遗留问题、范围外发现：① Claude 自定：笔记里生成图片只写图片说明（blob 地址离开页面就失效，不写成图片链接，也没有另存原图）；图上「编辑」「分享」按钮不进长图。② 改了已有行为（只影响生成图片的回答，普通回答不变）：原来这类回答没有丝带、多轮时还弹改版提醒，现在能收藏、不再提醒。③ 修复请求里有一个 `data-talvt-turn-state="in_progress"`，推断复制时某张图还在生成，未核实。④ 生成图片的回答里如果还带文字说明，结构没见过，未覆盖。⑤ 修复请求里的回答选择器那行变长了（照实写新选择器）。
- 本轮新坑：L-23。

## 改版提醒改成「查清了才提醒」，提醒上给下一步按钮（2026-11-11，Claude，常浩截图反馈「收藏按钮没挂上」只有显示、没有指引，看过三版预览后「按 C 改」，刷新插件在真实页面看过后「看过了，分两次提交」；已合并 PR #6（`717c6b6`）、无需发布）

- 时间：开工 `2026-11-11 12:20`（约）。★ 来由：常浩截图看到「收藏按钮没挂上……ChatGPT 可能改版了」，不知道该怎么做，要具体指引或一键修复。
- 核查：常浩 Chrome 里 5 个多轮对话（6～26 条回答）丝带都挂着、没有提醒，ChatGPT 没改版；截图左下角是「停止生成」按钮，推断是生成中的误报（当时的页面复现不了）。
- 改了哪些文件：`src/entrypoints/content.ts`（`arm`：每次扫描重新计时、到点比 `main` 的文字，页面静止 10 秒仍认不出才提醒；提醒改成「ChatGPT 改版了，收藏暂时用不了」+「复制修复请求」；`copyRepair` 写剪贴板；`browser.runtime.id` 没了就提醒「插件已更新，刷新这页才能收藏」+「刷新页面」，并停掉改版计时）；`src/lib/adapter.ts`（`repairRequest`：修复请求，只有选择器命中数、data- 属性名和次数、界面标记取值，编号换成 ID、数字换成 N）；`src/lib/ui.ts`（`notice` 加按钮参数 `acts`，点了按钮那行换成返回的字；关闭钮改用 `.x`）；`tests/snapshot.test.mjs`（新测试页「不停加节点」「只改文字」；改版用例断言新文案、复制的修复请求内容和不含对话内容、两种还在变的页面 12.5 秒不提醒、停下后提醒；最后一个用例加「插件已更新」提醒和点刷新）；`docs/PRD.md`（FR-9）；`docs/LESSONS.md`（L-21、L-22）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 50` / `ℹ fail 0`（证据目录 `2026-11-11-改版提醒C-全量测试.log`）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证各自报红（`2026-11-11-改版提醒C-反向验证.log`）：去掉到点比文字→「页面文字还在变（思考计时）不该提醒」；扫描不重新计时→「页面还在加节点（流式输出）不该提醒」；去掉插件过期提醒→等提醒超时。源码事先备份、验证后已恢复（`cmp` 一致）。中途：Playwright 浏览器缓存又不在了（L-16），`npx playwright install chromium` 装回。
- 验证：测试页（Playwright Chromium，无头）。修复请求的取值规则在常浩 Chrome 的一个真实对话上跑过（只在页面里算、没存）：回答标记取值是「ID:N:assistant」，编号都换成了 ID，没有对话文字。另用未登录的内置浏览器在 chatgpt.com 发过一句测试提问，想看生成中的页面：未登录版地址是 `/uc/…`、没有回答标记，和登录后不同，不能代表常浩的页面，所以没用停止按钮判断「生成中」，改用「页面静止」。**真实 Chrome 未验证**：生成中、长时间思考时确实不弹；插件更新后旧页面出提醒、点刷新后连上新插件（Playwright 测不了，L-21）。
- 截图：三版预览 https://claude.ai/artifact/8CuTgCyyCmrLt9Ma9So7y4 ；实装截图在证据目录 `2026-11-11-改版提醒C-截图/`（改版提醒、已复制、插件已更新，测试页），修复请求样例 `修复请求-测试页.txt`。
- 发布与回读：未发布，无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① Claude 自定：提醒和按钮的文案；修复请求的内容和取值规则；「插件已更新」提醒只在对话页、每页一次；没有用停止按钮判断生成中（选择器没法在登录页核实）。② 只改文字的变化要到点才比，停下后最晚约 20 秒才提醒（测试页第 30 秒）。③ 静止判断的残留风险：长时间思考如果页面一点都不变（文字也不变）超过 10 秒，仍会误报；某个页面一直有文字在跳，真改版了也不会提醒。④ 预览里写的「刷新后仍这样」没做（修复请求里也没写这句）。⑤ 已在旧版本里打开的页面不会出新提醒，要刷新一次装上新脚本后才生效。
- 本轮新坑：L-21、L-22。

## 导出 PDF 一直卡在「正在导出」：每步限时、写清卡在哪步（2026-11-10，Claude，常浩截图反馈「一直卡在这里，非常慢还没成功」；原因未查清；2026-11-11 常浩说提交，已提交 `c05703d`、无需发布）

- 时间：开工 `2026-11-10 13:30`（约）。★ 来由：常浩刷新插件后在真实 Chrome 里导出「数字分身 #142｜PR #143 工程审查」（3976px），卡片一直停在「正在导出 PDF…」。
- 改了哪些文件：`src/entrypoints/background.ts`（导出分四步、每步限时：打开打印页 20 秒、接上调试 10 秒、打印 60 秒、存进下载 15 秒；超时或出错都报「第 n 步「名字」…」，每步用时打到后台控制台；测试可用 `self.__pdfLimits` 改小）；`src/entrypoints/print/main.ts`（等图片和字体最多 8 秒，到时照样打印）；`src/lib/pdf.ts`（副本里去掉图片的 `loading` 属性）；`tests/snapshot.test.mjs`（新用例：打印一步永远不回，1.5 秒后卡片写「第 3 步「打印」超过 1.5 秒没完成」、标签页关掉、重试成功；失败用例的文字带上「第 2 步「接上调试」：」）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 50` / `ℹ fail 0`（`2026-11-10-导出PDF-卡住修复-全量测试.log`）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证：限时到点不报错，新用例报红（`2026-11-10-导出PDF-反向验证.log` 的 R5 重做；第一次的改法让后面步骤因别的原因报错，不算数）。
- 验证：复现没成功。有界面的 Playwright Chromium 导出 0.5 秒完成；去掉 Playwright 默认的防后台降速参数（`--disable-renderer-backgrounding` 等）仍 0.5 秒；回答末尾加懒加载图片（data: 地址、取不到的网址各一次）也不卡。每步用时记录在会话里，脚本在会话临时目录，未入库。卡住的真实原因未查清：限时加上后，常浩刷新插件再试回复「导出成功」（没说用的哪条回答、花了多久、顶部提示条和发给 AI 的效果）；是懒加载、残留状态还是别的原因让第一次卡住，仍不能确定。
- 截图：无（卡片样式没变，只是失败文字多了「第 n 步」）。
- 发布与回读：未发布，无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 常浩只反馈了卡住，限时和提示文案是 Claude 自定。② 打印页等图片最多 8 秒，等不到的图片在 PDF 里留空。③ 去掉限时做反向验证时看到：一直不回的话，过一会儿内容脚本会收到「message channel closed」，常浩那次为什么一直没报错还不知道。
- 本轮新坑：无（原因没查清，查清后再记）。

## 一键导出 PDF（2026-11-10，Claude，常浩看过三版入口预览选 A「卡片按钮」、确认加 debugger 权限、PDF「原样分页、图文同页、不附长图」，看过分批计划后“按推荐开工”、第 1 批后“继续第 2 批”；2026-11-11 常浩说提交，已提交 `c05703d`、无需发布）

- 时间：开工 `2026-11-10 13:05`（约，第 1 批交接写完后）。★ 来由：常浩收藏后要在 Obsidian 里手动导出 PDF 再发给 AI，想在插件里一键导出到「下载」。
- 改了哪些文件：`wxt.config.ts`（权限加 `debugger`，注释写明只给导出 PDF 用、常浩确认）；`src/entrypoints/print/`（新：插件自己的打印页，分段收 HTML、等图片字体好了回话）；`src/entrypoints/background.ts`（`pdf-part` 攒 HTML，`pdf` 开后台标签页→接 debugger→`Page.printToPDF`（A4、页边距 14/12mm、版心 703px 按回答宽缩放）→存进「下载」根目录→断开、关标签页；英文报错翻成中文）；`src/lib/pdf.ts`（新：拼 PDF 的 HTML——标题、来源 · 北京时间、链接、提问、回答快照；副本里有内容的元素改 `height:auto`，有边框或底色、不到 600px 的框整块不拆；分段送后台）；`src/lib/messages.ts`（新消息、`pages`）；`src/lib/ui.ts`（进度卡 `finish` 加 `pdf`，底部一行：「📄 导出 PDF」+「默认存储地址为「下载」」→正在导出→已存到「下载」· N 页 + 在访达中显示 / 没导出成 + 重试；导出中不自动关）；`src/entrypoints/content.ts`（单条、节选、整段收藏都给卡片接上导出，「已收藏过」「无 Obsidian」也有）；`tests/snapshot.test.mjs`（拦截放行 `chrome-extension://`；新 `describe('导出 PDF')` 4 个用例；两条卡片文字断言末尾加导出一行）；`docs/PRD.md`（FR-15、隐私一节、分期）；`docs/LESSONS.md`（L-19、L-20）；`AGENTS.md`（产出写到、测试要 poppler）；`public/安装说明.txt`（权限提示、导出 PDF 一节）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 49` / `ℹ fail 0`（日志 `2026-11-10-导出PDF-全量测试.log`，收尾前再跑一遍，见下一行）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证（`2026-11-10-导出PDF-反向验证.log`）：单条收藏不传导出→3 个用例红；不按样式挑框→「第 1 页有卡片被切开了」；不放开写死的高度→「不该有字叠在一起」（这条检查是第二次补的，第一次去掉没报红）。去掉 table/tr 的不拆规则不报红：测试页的表格外面有带边框的框，已被按样式挑中。PDF 用 poppler 的 `pdfinfo`、`pdftotext` 核对：A4、页数和卡片一致、标题/来源/提问/正文在、属性区和长图不在、表格和卡片不跨页、没有叠字。
- 验证：只在测试页（Playwright Chromium，无头）验证。样张 PDF 和逐页图在证据目录 `2026-11-10-导出PDF-样张/`（测试页 ChatGPT 长回答 12 页、Claude 节选 1 页、整段 6 问 3 页），Claude 自己逐页看过：卡片、表格、代码框整块，没有叠字；首页底边有一道极淡的线（挪到下一页的卡片阴影），可接受。**真实 Chrome 未验证**：顶部「已开始调试此浏览器」提示条的样子、真实 ChatGPT/Claude 回答（含图片、公式）的 PDF 效果、在访达中显示，都要常浩试。
- 截图：进度卡四种状态（收藏完、正在导出、已存到、没导出成）在证据目录 `2026-11-10-导出PDF-卡片截图/`（测试页，示例内容）；入口三版预览 https://claude.ai/artifact/XFCPqUdfcR8TftwFEWhhez 。
- 发布与回读：未发布，无需发布；未 `npm run zip`（等验收后提交时一起）。
- 与授权不一致之处、遗留问题、范围外发现：① Claude 自定：文件名同收藏文件夹；PDF 头部写标题、来源 · 北京时间、链接；「已收藏过」「无 Obsidian」也给导出；导出失败的两种常见英文报错翻成中文、其余原样。② 「整块不拆」按样式挑框是启发式：高于 600px 的卡片、没有边框底色的分组仍可能被拆开；超过一页的代码块照常跨页。③ 深色模式页面导出时回答是深色底（跟页面、和长图一致），页边距是白的，未在测试页验证。④ 测试新依赖本机 poppler（不是 npm 依赖，没改 `ALLOWED_DEPS`），没装会报错。⑤ 前一轮发现的 FR-14 长图粘给 AI 看不清，仍未处理。
- 本轮新坑：L-19、L-20。

## 删掉「为什么存」（2026-11-10，Claude，常浩提出「基本没用过，删了吧」，看过分批计划后“按推荐开工”；2026-11-11 常浩说提交，已提交 `c05703d`、无需发布）

- 时间：开工 `2026-11-10 12:52`。★ 来由：常浩定「导出 PDF」入口选 A 版（进度卡上的按钮，三版预览 https://claude.ai/artifact/XFCPqUdfcR8TftwFEWhhez）时，顺带要求删掉 FR-8；导出按钮放在原来「为什么存」的位置。
- 改了哪些文件：`src/lib/ui.ts`（删 `whyBox`、`Why`、相关样式，`finish` 去掉 `why` 参数）；`src/entrypoints/content.ts`（单条、整段收藏不再传 `why`）；`src/lib/messages.ts`、`src/entrypoints/background.ts`（删 `why` 消息和结果里的 `why`）；`src/lib/vault.ts`（再收藏不再读旧笔记里的 `why`，删 `saveWhy`，连带删掉只给它用的 `readNote`、`text`）；`src/lib/why.ts`（删除）；`tests/snapshot.test.mjs`（原「为什么存」用例换成「已删」用例：卡片上没有输入框，旧笔记里的 `why` 再收藏后不保留；改版自检用例去掉「标黄时也能写一句」）；`docs/PRD.md`（FR-8 标删、FR-13 去掉「沿用为什么存」）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 45` / `ℹ fail 0`（日志在证据目录 `2026-11-10-删为什么存-全量测试.log`）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证：源码换回删除前（`git stash` 只收 `src`），新用例报红「卡片上不该再有「为什么存」」（`2026-11-10-删为什么存-反向验证.log`），已恢复。中途：Playwright 浏览器缓存又不在了（L-16），`npx playwright install chromium` 装回。
- 验证：只在测试页（Playwright）验证；真实页面未看。另做了 PDF 导出的可行性实验（最小插件 + `debugger` 权限，扩展页 `Page.printToPDF` 不弹框直接下载，A4 两页、中文可用 `pdftotext` 提取），脚本和输出在证据目录 `2026-11-10-PDF导出可行性实验/`。
- 截图：无（只是去掉了卡片底部的输入框）。
- 发布与回读：未发布，无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① Claude 自定（计划里写明、常浩“按推荐开工”）：旧笔记里已写的 `why` 不动，但再收藏同一条时被新笔记覆盖、不保留。② 已定改动由常浩本轮确认：插件要加 `debugger` 权限（`wxt.config.ts` 原注释写着不要），第 2 批改。③ 范围外发现：FR-14 把长图复制到剪贴板粘给 AI 时，长图会被 AI 缩到看不清（推断，未实测），没改。
- 本轮新坑：无。

## 「收藏按钮没挂上」提醒误报、弹了不走（2026-11-07，Claude，常浩截图反馈丝带挂着还提醒、页面没加载完就先弹，要求核查流程修 bug，刷新插件看过后“看过了，提交”；已提交、无需发布）

- 时间：开工 `2026-11-07 22:30`（约），本节写于 `2026-11-07 22:46`。★ 来由：常浩多次看到丝带已挂上，右下角还是「收藏按钮没挂上」，而且一直不消失。
- 改了哪些文件：`src/entrypoints/content.ts`（`watchChat`：每次扫描都重新判断；页面上有两个以上提问、零条回答才算「认不出」，连续 10 秒才提醒，每个对话一次；认出回答或换了对话就收起提醒）；`src/lib/adapter.ts`（`countQuestions`：提问条数，选择器仍在适配模块里）；`src/lib/ui.ts`（`notice` 返回提醒元素）；`tests/snapshot.test.mjs`（改版自检用例重写：三页同时开——ChatGPT 测试页改掉回答标记该提醒，之后改回标记提醒自动收起；对话 12 秒后才出来的 Claude 页不提醒；只有一问、没有回答的 Claude 页不提醒；原来的 Claude 改版页只有一问，删掉）；`docs/PRD.md`（FR-9）；`docs/LESSONS.md`（L-18）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 45` / `ℹ fail 0`（日志在证据目录 `2026-11-07-改版自检误报-全量测试.log`）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证各自报红：整体换回旧代码（「页面还在加载（对话还没出来）不该提醒」）、去掉自动收起（等提醒消失超时）、去掉「至少两问」（「只有一问、回答还没出来（还在生成）不该提醒」）。
- 验证：测试页（Playwright）。常浩刷新插件后在真实页面看过（“看过了，提交”），看了哪些页面未说明。
- 截图：无（提醒样式没变）。
- 发布与回读：无需发布；提交后已 `npm run zip`。
- 与授权不一致之处、遗留问题、范围外发现：① Claude 自定的取舍：只有一问的对话和「第一问还在生成」从页面上分不出，所以只有一问的对话即使真改版了也不提醒（真改版时多轮对话会提醒、丝带也不出现）。② 常浩截图那次具体是哪种情况（加载慢还是思考久）没法确认，两种都已覆盖。③ 本会话标题仍是「收藏器·剪贴板｜长图自动复制」，没改。
- 本轮新坑：L-18。

## 长图同时复制到剪贴板（2026-11-07，Claude，常浩提出：点丝带收藏整条回答或选中段落时，生成的长图默认放进剪贴板，整段收藏不算；真实页面试过“可以了”后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-07 22:00`（约），本节写于 `2026-11-07 22:16`。★ 来由：常浩想收藏完直接粘贴长图。
- 改了哪些文件：`src/entrypoints/content.ts`（新 `copyLater`：`capture` 开头、第一个 `await` 之前就调 `navigator.clipboard.write`，交给剪贴板一个等长图的承诺，`toPng` 做好后 `give`；长图没做成就 `drop`；写成功进度卡「PNG 文件」一步写「NNNpx · 已复制」，失败或交出长图后 3 秒没写成写「未复制」，收藏照常；`captureThread` 没动）；`tests/snapshot.test.mjs`（启动后给剪贴板读写权限；新用例：整条收藏剪贴板里的图和长图同宽高、节选收藏剪贴板里是节选那张；整段收藏用例加一条：剪贴板里原来的文字不变）；`docs/PRD.md`（FR-14、分期）；`docs/LESSONS.md`（L-17）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 45` / `ℹ fail 0`（日志在证据目录 `2026-11-07-剪贴板-全量测试.log`）；`npm run compile` 无报错。反向验证：去掉 `clip.give(png)`，两个新用例报红，进度卡显示「11943px · 未复制」、收藏照常完成。中途：Playwright 浏览器缓存又不在了（L-16 再次出现），`npx playwright install chromium` 装回。
- 验证：只在测试页（Playwright，已给剪贴板权限）验证。**真实 Chrome 里未验证**：测试给了剪贴板权限，测不出「做图好几秒后才写入，Chrome 还认不认这次点击」；代码按「点击当时就交出承诺」写，要常浩在 chatgpt.com、claude.ai 真实页面各试一次（含节选）。常浩 22:20 回复「粘贴不出来」（没说哪个站、卡片写什么）。Claude 用有界面的 Playwright Chromium、不给剪贴板权限、测试页复现：第一次「665px · 未复制」、控制台报「长图没做成」（原因没查清），之后 5 次（Claude 3 次、ChatGPT 2 次，含 11944px 长图）都是「已复制」、系统剪贴板里有 PNG。常浩的 Chrome 配置目录没有读权限，看不到他装的是不是新版本。之后常浩说明是忘了刷新插件，刷新后真实页面（ChatGPT「收藏选中」）试过「可以了」；整条收藏、Claude 是否在真实页面试过未说明。
- 截图：无（只在进度卡已有的一步下面多了「· 已复制」几个字）。
- 发布与回读：无需发布；提交后已 `npm run zip`。
- 与授权不一致之处、遗留问题、范围外发现：① Claude 自定：进度卡「PNG 文件」下写「已复制 / 未复制」作提示，没出三版 UI（只是一步下面的小字）。② 剪贴板里的图 Chrome 会重新编码，测试只比宽高、不比字节。③ 长图很长时（如 1 万多像素高）粘贴到别的软件里的效果未测。④ 收藏进行中切到别的标签页或窗口，Chrome 可能拒绝写入，这时显示「未复制」。⑤ 跑全量测试会清空 Mac 剪贴板（L-17）。
- 本轮新坑：L-17。


## Claude Code 会话页不挂丝带（2026-11-05，Claude，常浩截图问「这啥情况」，看过原因和修法后说“修复”，并给了一个会话页让 Claude 测试，复验后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-05 13:55`（约），本节写于 `2026-11-05 14:13`。★ 来由：常浩在网页上看 Claude Code 会话，每条消息左边都叠着收藏丝带。
- 改了哪些文件：`src/lib/adapter.ts`（`findAnswers`：Claude 不在对话页 `/chat/…` 时一条回答都不认，丝带、节选、整段收藏都跟着不出现；ChatGPT 不变）；`tests/snapshot.test.mjs`（新用例：`claude.ai/code/session_fixture` 放同一份 Claude 测试页，不该有丝带，对话页照常有）；`docs/LESSONS.md`（L-15、L-16）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 43` / `ℹ fail 0`；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证：去掉 `inChat()` 判断，新用例报红（「Claude Code 会话页不该有丝带」）。中途：Playwright 的浏览器缓存整个不在了，测试全挂，`npx playwright install chromium` 装回（L-16）。
- 验证：Claude in Chrome 只读打开常浩给的会话页 `claude.ai/code/session_01Jp…`，修复前：3 条 `assistant-message`、3 条丝带（确认原因）；没读会话内容。常浩刷新插件后复验：同一会话页 2 条 `assistant-message`、0 条丝带；常浩的 Claude 测试对话 `claude.ai/chat/1a83…` 4 条回答、4 条丝带，照常。读完关了标签页。
- 截图：无。
- 发布与回读：无需发布；已重新 `npm run zip`。
- 与授权不一致之处、遗留问题、范围外发现：claude.ai 的分享页（`/share/…`）、项目页等非 `/chat/` 页面现在也不挂丝带，原来也没当作支持范围。
- 本轮新坑：L-15、L-16。

## 丝带统一：字竖着写在丝带上（2026-11-04，Claude，常浩提出选中和整段样式统一、整段也做成荧光笔，看过三版网页后选“A 紫色反斜纹”，真实页面看后嫌“不是很清楚”，再看三版后选“B”浅色荧光笔，真实页面看后“清楚了，提交”；已提交、无需发布）

- 时间：开工 `2026-11-04 14:44`（约），本节写于 `2026-11-04 14:49`，14:55 补 B 版。★ 来由：常浩看了选中（上方标签）和整段（纯紫丝带）两张截图，要求信息都竖着放在丝带上、整段换一种花纹和颜色。
- 改了哪些文件：`src/lib/ui.ts`（去掉选中时上方的「收藏选中 · N 块」标签；选中时丝带拉长到至少 104px，竖着写「收藏选中·N块」，白字带深色描边；往下拉没到位是琥珀色 45° 斜纹配深色字「继续下拉」，到位是紫色 45° 斜纹（和选中的 135° 方向相反）配白字「松手收藏整段」）；之后按「丝带清晰度」B 版改成浅色斜纹配深色字（选中浅蓝配深蓝、没到位浅琥珀配深棕、到位浅紫配深紫），丝带从 16px 加宽到 18px，字 11.5px、去掉描边；`tests/snapshot.test.mjs`（节选用例改查竖排字和丝带高度）；`docs/PRD.md`（FR-12、FR-13 的样式说明）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 42` / `ℹ fail 0`（A 版和 B 版各跑一遍，含「丝带落在回答左侧空白里」用例，加宽后仍过）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证：选中时不拉长丝带，节选用例报红（「选中时丝带该拉长，放得下竖排字」）。中途一次红灯：量高度时丝带还在做 0.18 秒的拉长动画，测试里等 300ms 再量。
- 验证：测试页（Playwright）截了选中和拉到位两种状态自己看过，字都在丝带里。A 版常浩真实页面看过嫌不清楚；B 版常浩真实页面看过（“清楚了”）。
- 截图：三版预览发布成网页：丝带统一 https://claude.ai/artifact/VXkj3VcRBvN2YMzjGynD6p、丝带清晰度 https://claude.ai/artifact/3JC8nozK9SfwYxCb4Y2ybg（示例内容）；自查截图在会话临时目录，未入库。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：常浩同时要求加一条全局规则（UI 预览一律发布成网页、回复里给链接，不发截图、不贴本地路径），已写进 `~/.claude/CLAUDE.md` 第 9 节；Codex 的 `~/.codex/AGENTS.md` 和 Vault P-08 没改。
- 本轮新坑：无。

## M2 增强续：整段收藏（2026-11-04，Claude，用户选丝带变体「整段用拉长书签」、看过分批计划后“按推荐开工”、第 1 批真实页面试过（截图）、第 2 批真实页面看过后“对了，做第 3 批”、看过收尾后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-04 13:50`（约，看完计划后），本节写于 `2026-11-04 14:36`。★ 来由：脑暴选出的第 4 项「整段对话」，侦察见 [docs/recon/2026-11-04-整段收藏侦察记录.md](docs/recon/2026-11-04-整段收藏侦察记录.md)（本轮一起提交）。
- 改了哪些文件：`src/lib/ui.ts`（丝带按住往下拉：pointerdown 后事件挂窗口，往下超过 6px 算拉，丝带高 60 + 拉动距离，拉过 50px 出竖排字「继续下拉」，过 100px 变紫写「松手收藏整段」，松手到位调 `onPull`、不到位弹回；拉过那次补出来的 click 不算点击；缺口改成固定 8px 不随长度变；进度卡加 `title()`）；`src/lib/thread.ts`（新：滚到顶，逐条滚到下一条开头、等 0.4 秒、按顺序号重新找节点再读，读完滚回原位，返回读了几条、漏了几条）；`src/lib/adapter.ts`（`threadItems`：Claude 用对话行 `data-index`，ChatGPT 用页面顺序；抽出 `userText`）；`src/lib/jump.ts`（导出 `scrollParent`）；`src/entrypoints/content.ts`（`captureThread`：逐条截长图、转 MD，拼成一轮一轮，`thread-begin` → 每张长图一条 `thread-file` → `thread-end`；没选 Vault 只下载长图、一张一条；收完给「为什么存」和打开 Obsidian）；`src/lib/messages.ts`、`src/entrypoints/background.ts`（三条新消息）；`src/lib/vault.ts`（`threadFolder`：记录键 `thread:对话地址`，收藏过且在就沿用、被挪走返回 moved、否则新建；`finishThread`：写笔记、沿用 why、删上次多出的 `answer-NN.png` 和改名前的旧笔记、记收藏）；`src/lib/markdown.ts`（`buildThreadNote`）；`src/lib/snapshot.ts`（导出失败的报错带画布尺寸）；`tests/fixtures/claude-thread.html`（新：6 轮对话的虚拟列表，滚动后 100ms 才渲染，远处行卸掉）；`tests/snapshot.test.mjs`（`describe('整段收藏（拉长书签）')` 5 个用例；按张数找新卡片的 5 处改成共用 `collectCard`：先给旧卡片打记号、新卡片打编号）；`docs/PRD.md`（FR-13、分期）；`docs/LESSONS.md`（L-14）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 42` / `ℹ fail 0`（连跑两遍，机器负载 19–42）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证各自报红：拉过后补出的 click 不拦（2 个失败）、每步滚 3 屏（读成 4 问 5 答、卡片写「漏了 3 条」）、再收不沿用原文件夹（「已更新整段」失败）、不删多出的长图（「上次多出来的长图该删掉」）。中途红灯：改 `collectCard` 前完整测试连跑两次，各有一个旧的单条收藏用例超时（两次不是同一个），原因是按张数找新卡片、旧卡片 8 秒自动关（老坑），改后连跑两遍全过。
- 验证：测试页（Playwright）。常浩真实页面：第 1 批（只读）两段 Claude 对话，「Python 快速排序」两次 6 问 6 答都成，「求根公式」第一次第 10 条「画布导出 PNG 失败」（L-14），改逐条重新找节点后复验 6 张都成；第 2 批写入 Obsidian 常浩看过回复“对了”，Claude 没看到他 Vault 里的文件，ChatGPT 真实页面是否试过未记录。
- 截图：两张进度卡截图在会话里，未存证据目录。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① Claude 自定的默认（计划里推荐、常浩“按推荐开工”）：每条回答长图加文字都放；收完整段不改各条丝带的收藏状态；读的过程中不加停止按钮。② 笔记文件名「第一问前 30 字（整段）.md」，避免和同名单条收藏在 Obsidian 里重名；小标题是「k. 提问前 30 字」。③ 回答里自己的 `##` 标题和每轮小标题同级，Obsidian 大纲里会混在一起，没降级。④ 读完才统一写入，全部长图先放在内存里；很长的对话内存占用未测。⑤ 很长的对话会不会分页加载、ChatGPT 长对话会不会卸载远处的行，样本太短未验证。⑥ 测试页模拟「重绘换节点」没能复现 L-14，那条修复没有能报红的测试。⑦ 遗留未查：同一条回答第二次单条收藏新建「(2)」文件夹。
- 本轮新坑：L-14。

## M2 增强续：只收选中段落（2026-11-04，Claude，用户选丝带变体「选中用荧光笔」、看过分批计划后“按计划开工”、真实页面“试过了”、看过后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-04 13:05`（约），本节写于 `2026-11-04 13:32`。★ 来由：脑暴选出的第 2 项，样式取丝带变体原型 C 版的选中样式。
- 改了哪些文件：`src/lib/adapter.ts`（`answerBlocks`：Claude 取正文 `.standard-markdown` 的直接子元素和 Artifact 卡片，ChatGPT 取段落、标题、列表、表格、代码块、文档块、卡片网格、带框卡片、公式里最外层的那个；`selectedBlocks`：块里真选中了字才算）；`src/lib/ui.ts`（丝带外面包一层吸顶容器，`pick(n)` 变蓝色斜纹并显示「收藏选中 · N 块」标签；`pointerdown` 里 `preventDefault`）；`src/entrypoints/content.ts`（`selectionchange` 更新丝带；点丝带时有选中块就走节选：不含选中块的部分打 `data-clipper-cut`，长图走 `drop`（去掉后重新量高）、笔记走 `exclude`，收完清掉；指纹 = 回答指纹 + `~块序号`；文件夹名加「（节选）」；笔记跳回链接仍用回答指纹；节选不改丝带的收藏状态）；`src/lib/markdown.ts`（`buildNote` 的 `excerpt` → frontmatter `excerpt: true`）；`tests/snapshot.test.mjs`（`describe('只收选中段落')` 3 个用例；末尾「插件刷新」用例改成给旧卡片打记号找新卡片）；`docs/PRD.md`（FR-12、分期）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 37` / `ℹ fail 0`（连跑两遍）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证（只跑这组用例）各自报红：长图不去掉没选中的块（长图高 665，应为 93）、笔记不跳过（笔记里有代码和别的小节）、不取最外层块（ChatGPT 网格数成多块）、指纹不带块序号（选别的块没有另存）、节选把丝带标成已收藏。**去掉 `pointerdown` 的 `preventDefault` 测试不报红**：Playwright 的 Chromium 里点按钮本来就不清选区，这一条留在真实页面看。中途一次红灯：「插件刷新」用例按卡片个数找新卡片，被新用例多出的一张会自动关的卡片打乱（老坑），已改。
- 验证：只在测试页（Playwright）验证；Claude 节选长图与浏览器里只留这两块的样子逐像素比通过。常浩在真实页面试过（“试过了，提交”）；ChatGPT 块的划分按测试页结构写，Claude 未单独记录他试了哪几处。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：① 三处 Claude 自定的默认（计划里说过，常浩没反对）：选区跨两条回答时两条丝带都变荧光笔各算各的；同样几块再收覆盖、选了别的块另存；卡片网格、表格、代码块整个算一块。② 节选收完后，丝带在选区还在时仍是荧光笔，取消选择后恢复原状态。③ 节选的笔记标题、文件夹标题仍取整条回答的标题。④ 遗留：同一条回答第二次收藏新建「(2)」文件夹，原因未查。
- 本轮新坑：无。

## M2 增强续：跳回原回答、在 Obsidian 里打开（2026-11-04，Claude，用户选丝带变体「选中用荧光笔、整段用拉长书签」、跳回先选闪黄光后嫌太重改选 C「开头一抹淡黄」、提出并选定 A 版「点绿块打开 Obsidian」、看过计划后“按计划开工”、真实页面“都测试了没问题”、看过后“提交”；已提交、无需发布）

- 时间：开工 `2026-11-04 12:25`（约），本节写于 `2026-11-04 13:12`。★ 来由：脑暴选出的第 6 项「跳回原回答」，常浩试用时追加「点绿块打开 Obsidian」；试用中撞到刷新插件后收藏卡住。
- 改了哪些文件：`src/lib/jump.ts`（新：读 `#clip-`，按指纹在对话里找回答，没渲染就往上翻，滚到开头）；`src/lib/ui.ts`（`flashAnswer` 开头一抹淡黄 + 丝带变黄；`Place.open` 绿块整块可点、悬停换提示；`finish` 失败时把转圈的步骤标失败）；`src/entrypoints/content.ts`（笔记 url 带编号；进入对话页时跳回；绿块打开 Obsidian 或设置页；收藏流程总 `catch`，插件失联时提示刷新页面）；`src/lib/markdown.ts`（正文顶部「↩ 打开原回答」）；`src/lib/vault.ts`（`loadWhere`/`saveWhere`/`obsidianUrl`）；`src/entrypoints/background.ts`、`src/lib/messages.ts`（save 结果带 `open` 链接）；`src/entrypoints/options/index.html`、`main.ts`（「在 Obsidian 里打开」位置输入框，末段和所选文件夹对不上时提示）；`tests/snapshot.test.mjs`（跳回、打开 Obsidian、插件刷新 3 个用例，笔记断言跟着改）；`tests/vault.test.mjs`（链接生成）；`docs/PRD.md`（FR-10、FR-11、分期）；`docs/LESSONS.md`（L-13）。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 34` / `ℹ fail 0`；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证各自报红：不往上翻、不高亮、不传打开动作、去掉收藏流程总 `catch`。中途一次红灯是测试按卡片个数找新卡片，旧卡片 8 秒自动关后对不上，改成给旧卡片打记号。
- 验证：Claude in Chrome 只读打开 Claude 测试对话（带 `#clip-`）：编号保留，插件往上翻到回答并播放高亮；第一版高亮在长回答上看不出（滚到中间、四边在屏外），改成滚到开头。常浩真实页面试过跳回和打开 Obsidian（“都测试了没问题”），之后嫌黄框太重改成 C 版，C 版待常浩再看一眼。ChatGPT 打开带编号的链接也能跳（常浩试过）。
- 截图：三版预览在会话笔记目录 `side-session-notes/local_091f3a6b-…/`（`丝带变体-三版原型.html`、`拉绳-三版原型.html`、`打开Obsidian-三版预览.html`、`跳回高亮-三版预览.html` 及同名 png，示例内容）。
- 发布与回读：无需发布；提交后已 `npm run zip`。
- 与授权不一致之处、遗留问题、范围外发现：① 常浩 11:39 和 12:37 两次收藏「略微有点长，毕竟是内部通知…」那条回答，第二次新建了「(2)」文件夹没有覆盖，说明两次指纹不同，原因未查。② 绿块上记了 `data-href`（要打开的链接）方便测试核对，无界面影响。③ 打开 Obsidian 用 `obsidian://open?vault=…&file=从 Vault 根开始的路径`，Chrome 第一次会问是否打开。
- 本轮新坑：L-13。

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
