# 当前状态

当前阶段目标：按 2026-11-20 评估结果分批优化。A 修缺陷、B 文档对齐已做并合并（#21，PR #22，`4203531`）；C 结构简化、D 碰已定内容的两项（改版自检补盲区；稳定编号与清单重建）、E 真实 Chrome 冒烟清单与清理旧 worktree 都还没做，做哪批由常浩定。

更新：2026-11-21。A、B（#22）、C（#24，`981cb45`）都已合并，主目录已拉齐并重新构建（00:58）。C 批已在真实 Chrome 代验（单条收藏、页面自检、导出 PDF 通过）。下一步：再定 PRD 三处说法删不删，以及 D、E 做不做。

### 主线：评估后分批优化｜完成 3/5

- ✅ A 修缺陷（#21，已合并，2026-11-20 常浩验收）：长图里图片、字体没嵌进时标黄；恢复和整段消息限时；小硬化三处；Claude 兜底文件名
- ✅ B 文档对齐（#21，已合并）：AGENTS、README、PRD、LESSONS、验收矩阵对齐现状；旧交接归档；新建 GLOSSARY.md、docs/DECIDED.md
- ❓ PRD 里三处写了没实现的说法（点插件图标进入选择模式、处理伪元素、CDP 截图后备）删不删：等常浩定
- ✅ C 结构简化（#23，PR #24 已合并 `981cb45`）：五步都已做完，行为不变；真实 Chrome 已代验
- 📌 D 碰已定内容：① 改版自检补盲区（FR-9）② 笔记写稳定编号、已收藏清单可从 Vault 重建、manifest 加固定 key（FR-5、FR-10）；每项动手前单独发「改动确认」
- 📌 E 真实 Chrome 冒烟清单；清理三个已合并分支的旧 worktree



## C 批：结构简化，不改行为（2026-11-20，Claude，常浩回「先做 C」；已合并 PR #24（`981cb45`，2026-11-21 常浩回「合并」），主目录已重新构建，未打包发布）

- 时间：开工 `2026-11-20 23:17`。★ 来由：接手成本评估的 C 批（issue #23）：两个巨型函数、身兼七职的 vault.ts、同一概念多套叫法、限时和发消息各写各的。
- 改了哪些文件：五个提交。① `tests/snapshot.test.mjs` 改名 `tests/e2e.test.mjs`，`scripts/hooks/pre-push`、README、LESSONS 同步（没有拆成多个文件：用例共用一个浏览器、前后有状态依赖，拆开要重写整套搭建）。② 新 `src/lib/timeout.ts`（`within()`、`Stuck`、限时表 `LIMITS`，测试统一用 `globalThis.__limits` 改小）、`src/lib/ask.ts`（唯一的 `ask()` / `send()`）；`src/lib/messages.ts` 改成每种消息一行 `req` / `res`；`src/entrypoints/background.ts` 的消息处理改成按类型的处理表 `handlers`。③ `src/lib/vault.ts` 拆到 `src/lib/vault/` 七个文件（store、fs、dir、journal、save、staging、diag），`vault.ts` 只做统一出口；整段收藏四步改叫 `beginThread` / `stageThreadFile` / `endThread` / `cancelThread`。④ 新 `src/lib/persist.ts`（`saveSingle` / `saveThread` 入库返回 `Outcome`，`describeSingle` / `describeThread` 定下卡片显示什么）；`src/entrypoints/content.ts` 的 `capture()` 拆出 `produce()`，两条流程共用入库和收尾；`tests/thread-save.test.mjs` 改成 `tests/persist.test.mjs`（直接导入真实模块，补单条收藏判定表 4 条）。⑤ `src/lib/adapter.ts` 改成 `chatgptSite`、`claudeSite` 两个站点对象；新 `src/lib/dom.ts` 收三个重复的小函数；去掉 `Snapshot.nodes`、`Snapshot.ms`、`TITLE_SELECTORS`。文档：README 代码结构表、`GLOSSARY.md` 两处、本文件。
- 测试：见下一行；`npm run compile` 无报错；`node scripts/check-rules.mjs` 输出「通用规则检查通过」。不含端到端的 6 个测试文件 `ℹ pass 58` / `ℹ fail 0`。
- 验证：替身（无头 Chromium 加测试页、内存假文件系统），没在常浩的真实 Chrome 里试。端到端分步跑：第 ②③ 步后 49 条过 47，两条计时用例偶发失败、单独重跑都过（`e2e-step3.txt`、`e2e-step3-rerun2.txt`）；第 ④ 步后 `ℹ pass 49` / `ℹ fail 0`（`e2e-step4.txt`）。第 ⑤ 步后的全量当时机器负载均值 45～68（别的会话在编译），三遍都没全绿，每遍失败的用例不同、单独重跑都过：`full-final.txt` 107 条过 89（一条限时用例失败连带取消 15 条）、`full-final-2.txt` 过 106（失败的那条是我把测试里的人为限时改成 4 秒改坏的，已改成 2.5 秒，单独两遍都过）、`full-final-3.txt` 过 105（改版自检提醒、恢复限时两条计时用例）。负载降下来后（开始时 1 分钟负载 9.71）的一遍全量 `ℹ pass 107` / `ℹ fail 0` / `ℹ cancelled 0`（`full-quiet.txt`），也写在 PR #24 评论里。证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-20-issue-23/`。
- 真实 Chrome 代验（2026-11-21 09:20，合并、主目录 00:58 重新构建、常浩刷新插件后，Claude in Chrome 操作 chatgpt.com 那条生成图片的回答，真实鼠标点击）：① 页面自检：内容脚本和后台都是 00:58 的包，七步全通，不带已收藏条数。② 丝带一打开就是「已收藏」（重构后指纹没变）。③ 再收一次：四步全绿，「271px · 已复制」「已更新」，绿块可点开 Obsidian；Vault 里同一个文件夹的 `answer.png`、笔记 09:20 更新，没有新建文件夹，笔记无 `incomplete`。④ 导出 PDF：「已存到「下载」· 1 页」，`~/Downloads/2026-11-21 用你知道的关于我的一切….pdf`（约 4MB）。没在真实 Chrome 验的：整段收藏、节选、Claude 站、各种失败退回下载的路径。
- 截图：无（界面没变）。
- 发布与回读：未发布。主目录的 `.output/chrome-mv3` 已在合并后重新构建。
- 与授权不一致之处、遗留问题、范围外发现：① 测试文件只改名、没拆分（原因见上）。② 测试里那条「后台不回话」用例的人为限时从 1.5 秒改成 2.5 秒：机器忙时 1.5 秒内连退回下载的消息都回不来。③ 端到端里的计时类用例在机器很忙时会偶发失败，这次没治本。④ `src/entrypoints/content.ts` 还有约 430 行，改版自检（`watchChat` / `arm`）和挂丝带没有动。⑤ 没有改变用户看得到的行为；内部函数名、测试开关名变了。⑥ 只做了电脑版。
- 本轮新坑：无。

## 评估后第一批：修静默失败与卡死缺口、文档对齐（2026-11-20，Claude，常浩看过评估和分批清单后回「先做 A 和 B」；已合并 PR #22（`4203531`），主目录已重新构建，未打包发布）

- 时间：开工 `2026-11-20 19:34`。★ 来由：当天做了接手成本评估（Claude 通读源码）和 Fable 5.2 High 独立评估，合并出 A～E 五批；常浩选先做 A、B（issue #21）。
- 改了哪些文件（A 代码）：`src/lib/snapshot.ts`（`embedResources()` 返回没嵌进的图片、字体数；32px 以内的小图标不算；导不出画面的 canvas 算进图片）；`src/entrypoints/content.ts`（没嵌进时「PNG 文件」标黄、卡片和笔记写明数量；新 `ask()`：发给后台的消息统一限时，整段收藏的三条消息、取跨域图片都用它；测试改限时从 `<html data-clipper-save-limit>` 换成内容脚本环境里的 `__saveLimit`）；`src/lib/markdown.ts`（`buildNote()` 只有改版自检没过时才写「页面可能改版了」）；`src/lib/vault.ts`（`recover()` 整体限时 15 秒，到时报错、日志留着）；`src/entrypoints/background.ts`（文件只收 `data:` 地址；不是设置页问的自检不带已收藏条数）；`src/lib/naming.ts`（没有标题时笔记叫「<站名> 回答.md」）；`src/entrypoints/options/index.html`（页面标题改「AI 回答收藏器 · 设置」）。
- 改了哪些文件（测试）：`tests/snapshot.test.mjs`（新用例「长图里有图片没取到…」；自检用例加「页面拿到的不带已收藏条数」「后台不收非 data: 地址」；超时用例改用 `__saveLimit`，并断言网页改 `data-clipper-save-limit` 不管用）；`tests/vault-save.test.mjs`（新用例「上次没写完的收藏恢复不了…」）；`tests/thread-save.test.mjs`（三条「后台一直不回话」用例）；`tests/naming.test.mjs`。
- 改了哪些文件（B 文档）：`AGENTS.md`（开头去掉「离线 HTML」、写上 Claude；导航表加术语表、登记表、归档三行；「分工」第二条换成骨架现行写法；结构树）；`README.md`（代码结构表补全）；`docs/PRD.md`（FR-5、FR-7 补本轮和 2026-11-12 的行为；第 6、9 节 `debugger` 的过期说法）；`docs/LESSONS.md`（「没有提交前钩子」「还没有条目」两处过期；两处源码行号改成函数名）；`docs/acceptance/M1-验收矩阵.md`（第 4 行补 P9 已修）；`CURRENT.md`（2026-11-12 及更早的 30 节移到 `docs/history/CURRENT-2026-11-02至11-12.md`，内容未改）；新建 `GLOSSARY.md`、`docs/DECIDED.md`（27 行，前 25 行是补登记）。已登记 DECIDED.md。
- 测试：在本 worktree 里 `node --test tests/*.test.mjs` 原样结果 `ℹ pass 103` / `ℹ fail 0`（`full-2-final.txt`；改同类之前的一遍也是 103 过，`full-1.txt`）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 输出「通用规则检查通过」。反向验证：把 `src/` 换回 `origin/main` 跑新用例，端到端三条全红（`red-old-code-e2e.txt`），其余五条里命名一条红、恢复和三条不回话的用例都挂到 15 秒超时被取消（`red-old-code-unit.txt`）。证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-20-issue-21/`。
- 验证环境：替身。端到端是 Playwright 无头 Chromium 加编的测试页，存储层是内存假文件系统。未在真实环境验证：没在常浩的真实 Chrome 里试；标黄卡片的样子沿用已有的标黄样式，没截图看。
- 真实 Chrome 代验（2026-11-20 21:50，合并、主目录重新构建、常浩在扩展页刷新后，Claude in Chrome 操作 chatgpt.com 一个生成图片的对话，真实鼠标点丝带）：① 页面 `clipper-diag`：内容脚本和后台都是 21:45 打的包，各步通，「列出记录」只有「没写完的收藏 0，整段收藏任务 0，文件夹 1」，不带已收藏条数。② 正常收藏：四步全绿，「271px · 已复制」「已存入」；Vault 里 `00 待整理/ChatGPT收藏/2026-11-20 用你知道的关于我的一切…/` 有 `answer.png`（1286275 字节，打开看过图在）和笔记。③ 往回答里临时加一张取不到的 200×100 图再收：顶部「已收藏，但可能不完整」，「PNG 文件」标黄，黄块「长图里有 1 张图没取到 / 其余部分已存好」，入库「已更新」；截图 `real-chrome-标黄卡片.png`（证据目录）。④ 去掉那张图再收一次恢复：四步全绿、「已更新」，笔记里没有 `incomplete`，文件夹只有一个。没在真实 Chrome 验的：恢复限时、整段收藏消息限时、取图限时（都要后台或文件夹卡住才触发）、字体没嵌进、Claude 站、后台拒收非 data: 地址。观察到：进度卡窄的时候「371px · 已复制」会折成两行（原来就这样，没改）。
- 截图：`~/Library/Application Support/chatgpt-clipper/evidence/2026-11-20-issue-21/real-chrome-标黄卡片.png`。
- 发布与回读：未发布。主目录的 `.output/chrome-mv3`（常浩 Chrome 加载的那份）没动；合并、主目录拉齐后要 `npm run build`，再到扩展页点刷新。
- 与授权不一致之处、遗留问题、范围外发现：① 顺手改（同类）：取跨域图片也限时 20 秒；导不出的 canvas 算进「没取到的图」（这一条没有测试）；设置页标题。② 字体只统计「该嵌却没取到」的；样式表跨域、读不了规则时仍然不知道缺没缺字体，不标黄。③ 恢复限时后，如果日志里的句柄真的失效，每次入库都会 15 秒后失败、退回下载，没有放弃恢复的出口（这种情况是推断，没复现过）；要不要在设置页加出口待常浩定。④ `src/lib/pdf.ts` 自己的 `send()` 仍不限时（后台打印各步有限时），留给 C 批合并消息函数时一起做。⑤ PRD 第 3 节「点插件图标进入选择模式」、第 5 节「处理伪元素」「CDP 撑高视口截图留作后备」三处代码里没有，没删，等常浩定。⑥ 跑全量测试清空了系统剪贴板（L-17）。⑦ 反向验证第一遍没加超时，旧代码下恢复用例一直挂着，停掉后从备份恢复了源码，重做时加了 `--test-timeout`。⑧ 只做了电脑版。
- 本轮新坑：无。

## 推送前钩子：从 worktree 推送不再把测试的 git 操作落到本仓库（2026-11-20，Claude，常浩回「开工，全部可合并」；已提交、PR 见下、无需发布）

- 时间：开工 `2026-11-20 12:25`。★ 来由：#16 装的推送前钩子（骨架 0.4.0）从 worktree 推送时，git 把本仓库的位置（`GIT_DIR`）带进钩子，钩子跑的 `tests/hooks.test.mjs` 在临时目录建仓库、提交、推送都继承了它：推送的分支多出测试提交，主目录变成裸仓库，测试却全过。#16 合并时没带修复；本仓库钩子 12:2x 前已停用，检查时没中招（`core.bare=false`，无测试提交）。
- 改了哪些文件：`scripts/hooks/pre-push`（`cd` 之后 `unset $(git rev-parse --local-env-vars)`；本项目定制的 `TESTS` 不动）、`tests/hooks.test.mjs`（换成骨架 0.4.1 版本：自己的 git 调用不继承这些变量，新增一条从 worktree 真推的用例）。和 my-skills#116 一致。
- 测试：本 worktree 里 `sh scripts/hooks/pre-push` 退出码 0（`通用规则检查通过`，`ℹ pass 49` / `ℹ fail 0`）；`node --test tests/hooks.test.mjs` `ℹ pass 4` / `ℹ fail 0`；全量 `npm run build && npm test` 退出码 0，`ℹ pass 97` / `ℹ fail 0`。证据：`~/Library/Application Support/agent-kit/evidence/2026-11-20-pre-push-hook-gitdir/`。
- 验证环境：本机真实 worktree。合并、主目录更新后装回 `git config core.hooksPath scripts/hooks`，再从 worktree `git push --dry-run` 一次，看分支提交数、`core.bare`、有没有测试提交。
- 本轮新坑：无（跨项目的坑，已向常浩提全局坑提案，未写入）。

## 入库卡死续：定位到句柄失效，限时连带中止、查授权不回改试读、设置页加版本与自检（2026-11-20，Claude，常浩说「还是不行…你来接手…必须修复这个问题」；已合并 PR #17（`9a1e82a`），未发布）

- 时间：开工 `2026-11-20 10:50`（约，接手时未用 `date` 记录，按会话时间）。★ 来由：#15 合并、打包后常浩仍入不了库，要求在本会话接手修好。
- 改了哪些文件：`src/lib/vault.ts`（`idb()` 每步限时，到时中止事务、关连接；`saveDir()` 读不出旧句柄照样存新的；`findDir()` 查授权不回改用 `probeDir()` 试读；新 `diagnose()`、`savePageDiag()`、`loadPageDiag()`）；`src/lib/messages.ts`（`diag` 消息、`Diag`、`BUILD`）；`wxt.config.ts`（打包时间写进代码）；`src/entrypoints/background.ts`（回 `diag`）；`src/entrypoints/content.ts`（`clipper-diag` 事件）；`src/entrypoints/options/`（底部版本行、「自检」按钮和结果区；选择失败的提示标成警示色）；`tests/snapshot.test.mjs`（新用例两条，原「查授权一直不回」用例加「只有查授权不回照常入库」）；`docs/PRD.md` FR-5、`README.md` 两处、`docs/LESSONS.md` L-26；本文件。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 93` / `ℹ fail 0`（证据目录 `2026-11-20-vault-hang-2/full-5.txt`）；`npm run compile` 无报错；`node scripts/check-rules.mjs` 通过。反向验证：旧代码（#15）下新用例报红 `'写被堵住' !== '写进了'`（`red-old-code.txt`）。中途两遍不算数：`full-3.txt` 93 条过 91（交接格式本来就红；「整段收藏」一条超时），`full-4.txt` 机器负载均值 148 时浏览器启动超时、20 条失败。
- 验证：常浩的真实 Chrome 158.0.8127.37（Claude in Chrome 操作 chatgpt.com 页面，扩展页和设置页由常浩操作）。① 旧版：点收藏，「入库」70 秒不动。② 加载 11:10 版：页面 `clipper-diag` 自检，查授权 3 秒不回。③ 加载 11:26 版：查授权、查只读授权、读文件夹都 3 秒不回。④ 常浩移除并重装插件、重新选文件夹：设置页截图显示设置页和后台自检全通（查授权 granted、读文件夹通）；我点一次收藏，`00 待整理/ChatGPT收藏/2026-11-20 …/` 下 11:43 写入 `answer.png`（139387 字节）和笔记。测试浏览器（Playwright Chromium，无头）里看过设置页新版式。
- 截图：设置页自查截图在会话临时目录，未入库；常浩发来的设置页截图在会话里。
- 发布与回读：未发布；主目录 `.output/chrome-mv3` 已打包，常浩的 Chrome 加载的是 11:26 那一版（全量测试会重新构建这个目录，时间戳会变，代码相同）。
- 与授权不一致之处、遗留问题、范围外发现：① Chrome 内部为什么不回话没查清，「升级重启后旧句柄失效」是按时间线的推断；下次 Chrome 升级重启后可能再出现，届时进度卡会在几秒内写明并退回下载，设置页重新选文件夹即可。② 常浩移除插件时清掉了「已收藏」记录（70 条）和设置，Vault 文件不受影响；记录没有恢复。③ 新增（常浩未点名）：设置页版本行和「自检」、页面 `clipper-diag` 事件（网页脚本也能触发，结果只有状态、数量和打包时间，没有文件夹名和收藏内容）。④ `saveDir()` 读不出旧句柄时不清「已收藏」清单：这时如果真换了文件夹，旧文件夹收藏过的回答在新文件夹会显示「已收藏过」。⑤ 第一轮推断（读句柄的事务卡住堵住写）不是常浩这次的原因，但缺口真实存在，修复保留。⑥ 验证时在常浩的一个对话里点了 4 次收藏（前 3 次卡在入库没写入，第 4 次写入一个文件夹）。⑦ 范围外：上一节（#15）的交接缺「开工 HH:mm」和「本轮新坑」两行，`handoff-format` 用例在 main 上是红的，本节补上后转绿；这条回答的收藏文件夹名取的是提问而不是回答里的标题，没查。⑧ 只做了电脑版。
- 本轮新坑：L-26。


## 装提交、推送前的必经检查钩子（2026-11-20，Claude，常浩批复盘 P4、P6「批（按改过的）」；已提交、PR 待合并，无需发布）

- 时间：开工 `2026-11-20 11:02`。★ 来由：跨项目复盘 P6「检查脚本接进必经环节」：没有 CI 的仓库装 pre-push 钩子；P4 的 commit-msg 钩子一起装。钩子来自起步骨架 0.4.0（my-skills#112）。
- 改了哪些文件：`scripts/hooks/pre-push`（推送前跑 `node scripts/check-rules.mjs` 和 `node --test $(ls tests/*.test.mjs | grep -v snapshot)`）、`scripts/hooks/commit-msg` + `commit-msg.mjs`（修复类提交正文要有「同类：」一行）、`tests/hooks.test.mjs`（单测 + 临时仓库真跑）、`AGENTS.md`（加安装命令 `git config core.hooksPath scripts/hooks`）；`CURRENT.md` 还顺手补了 #15 交接漏的开工时刻和「本轮新坑：L-25」两行（#15 合并后交接格式测试红）；本文件。
- 测试：`node --test tests/hooks.test.mjs` 原样 `ℹ pass 3` / `ℹ fail 0`；在本 worktree 里 `sh scripts/hooks/pre-push` 退出码 0（证据 `~/session-retro/2026-10-18_2026-11-18/evidence/p6-hooks/chatgpt-clipper.txt`）。
- 验证环境：替身（临时 git 仓库、本机裸仓库）；本仓库的 `core.hooksPath` 合并后才在本机装，装后真推一次再算验收。
- 外部前提与实测：依赖 git 的 `core.hooksPath` 和钩子退出码，已在临时仓库实测。
- 与授权不一致之处、遗留问题、范围外发现：无。
- 本轮新坑：无。

## 入库卡死：取 Vault 文件夹、查授权和等后台回话都限时（2026-11-20，Claude，常浩真实 Chrome 收藏卡在「入库」、发来扩展卡片、后台控制台和设置页三张截图；已提交、PR 待合并，未发布）

- 时间：开工 `2026-11-20 09:56`（按证据目录建立时间补记）。★ 来由：#14 合并后常浩说「有问题，没办法入库了，卡死了」，刷新插件和页面后仍卡。Playwright 里 #14、#7 两份产物各收藏两次都正常，复现不出；常浩截图显示加载来源是主目录 `.output/chrome-mv3`、后台控制台空白、设置页停在「未选择」且状态提示为空（同库的 Obsidian 路径读得出）→ 判定卡在 `loadDir()` / `queryPermission()`。
- 改了哪些文件：`src/lib/vault.ts`（新 `findDir()`：取文件夹 + 查授权限时 5 秒，到时 `state: 'stuck'`；`DirState` 加 `'stuck'`）；`src/entrypoints/background.ts`（入库和整段收藏改用 `findDir()`，`stuck` 时回 `no-permission` 并写明读不出授权）；`src/entrypoints/content.ts`（等后台回「入库」限时 60 秒，到时标「超时」、退回下载、给「重试」）；`src/entrypoints/options/main.ts`（设置页用 `findDir()`，`stuck` 时写明、突出「选择文件夹」）；`tests/snapshot.test.mjs`（新用例）；`docs/PRD.md` FR-5；`docs/LESSONS.md` L-25；本文件。
- 测试：见 PR；证据目录 `~/Library/Application Support/chatgpt-clipper/evidence/2026-11-20-vault-hang/`（`red-old-code.txt` 旧代码下进度卡 30 秒没收尾，`green-new-code.txt`，`full-*.txt`）。
- 验证：Playwright Chromium（无头），用永不返回的 `queryPermission` 模拟；没在常浩的真实 Chrome 里试。
- 遗留：为什么常浩的 Chrome 里取文件夹或查授权不返回，没查清；先请常浩在设置页重新选一次文件夹，好了就说明是旧句柄坏了。
- 本轮新坑：L-25。

## 插件更新后给已开页面补装脚本，不用刷新（FR-9「只补装」）（2026-11-19，Claude，常浩选「换个改法（只补装）」，又同意加 chatgpt.com、claude.ai 两个站的 host 权限；已合并 PR #14（`73ea2de`），主目录已打包）

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

---

2026-11-12 及更早的交接已归档到 [docs/history/CURRENT-2026-11-02至11-12.md](docs/history/CURRENT-2026-11-02至11-12.md)。
