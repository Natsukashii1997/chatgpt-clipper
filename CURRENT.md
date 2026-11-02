# 当前状态

更新：2026-11-02。M1 ② 完成：WXT + TypeScript 插件骨架，回答左侧书签丝带「收藏」→ 下载长图 `answer.png`（方案 C 快照）；用户决定不要离线 HTML。唯一下一步：Markdown 笔记 + 写入 Vault（设置页极简一页选文件夹），用户要求在新会话做。

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
