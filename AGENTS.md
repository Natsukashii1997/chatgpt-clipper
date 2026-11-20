# ChatGPT 回答收藏器（chatgpt-clipper） 协作约定（Codex / Claude 必读）

Chrome 桌面版 MV3 插件，常浩自用：在 ChatGPT 或 Claude 网页上一键把某条回答以长图 PNG + Markdown 笔记原样存进 Obsidian（离线 HTML 已于 2026-11-02 取消，见 PRD FR-3），另可只收选中段落、收整段对话、导出 PDF。进入顺序：本文件 → [CURRENT.md](CURRENT.md)（当前状态与唯一下一步）。需求以 [docs/PRD.md](docs/PRD.md) 为准。所有面向用户的文字用简体中文。本文件只放怎么开始和做什么事之前读哪份；操作细节在 [docs/OPERATIONS.md](docs/OPERATIONS.md)，按需读对应一节。

## 做什么事之前读哪份

| 要做的事 | 先读 |
|---|---|
| 改需求、加功能 | [docs/PRD.md](docs/PRD.md) |
| 读代码、起名字、写文档时碰到项目里的专有说法 | [GLOSSARY.md](GLOSSARY.md)（丝带、进度卡、节选、整段、指纹、块……只用里面的叫法） |
| 改界面、文案、交互、已有行为 | [docs/DECIDED.md](docs/DECIDED.md)：登记过的先单独问常浩；没登记不等于没定 |
| 改回答定位、捕获、快照逻辑 | [docs/recon/](docs/recon/) 里最新的侦察记录 |
| 排障、改脚本、装 launchd 或定时任务 | 先 `grep -n 关键词 docs/LESSONS.md`，再搜全局坑 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/LESSONS.md` |
| 开需求、拆任务、实现、审查 | 下面「Agent skills」一节 |
| 写交接、验收别人的交接 | [docs/templates/handoff.md](docs/templates/handoff.md) 骨架；[OPERATIONS](docs/OPERATIONS.md)「交接写法」「报告与验收」 |
| 做 M1 验收、看哪类没过 | [docs/acceptance/M1-验收矩阵.md](docs/acceptance/M1-验收矩阵.md) |
| 打包发给别人 | [OPERATIONS](docs/OPERATIONS.md)「打包发给别人」、`public/安装说明.txt` |
| 查以前某一轮做了什么 | [CURRENT.md](CURRENT.md) 只留近期几节，更早的在 [docs/history/](docs/history/) |

项目长出接口、样式、发布等文档后，在这张表里加一行。

## 分工

- 以用户每轮明确授权的范围为准；授权外的不做。
- 一次只做一件授权的事；范围外发现的问题按全局指令「代码库归你」一节（`~/.claude/CLAUDE.md` 第 3 节）处理：相关的顺手修、交付时分「要求的」「顺手改的」两栏列出；会改变已有行为或碰已定内容的先问；不相关的记进交接。
- 并行的会话各开独立 worktree，不在同一目录改代码；做不到时照全局坑 G-04，只提交自己的改动。

## 运行

```sh
node --test tests/*.test.mjs     # 交接格式 + 通用规则（含自测）；导出 PDF 的用例要本机有 poppler（brew install poppler）
node scripts/check-rules.mjs     # 只跑通用规则检查
git config core.hooksPath scripts/hooks   # 装提交、推送前的必经检查（每个克隆、每台电脑各一次；不用 --no-verify 绕过）
```

## 结构

```
AGENTS.md            入口（本文件）
CURRENT.md           当前状态与唯一下一步；每轮交接写在顶部
GLOSSARY.md          术语表：项目里的专有说法和代码里对应的名字
README.md            构建、加载、权限、代码结构（src/ 各文件做什么）
docs/PRD.md          需求（v2，开发基线）
docs/
  DECIDED.md         已定内容登记表（常浩选定、验收过的界面和行为）
  history/           CURRENT.md 归档出去的旧交接
  recon/             ChatGPT、Claude 页面结构侦察记录（截图在证据目录，不入库）
  reference/gpt-prd-v1/  GPT 起草的 v1 PRD 原文，只作参考，不是需求基线
  agents/            Matt Pocock 技能读的约定：issue 看板、分流标签、领域文档
  LESSONS.md         本项目的坑（排障、改脚本前先搜）
  OPERATIONS.md      操作手册：交接写法、报告与验收
  templates/handoff.md  交接一节的骨架
  acceptance/        验收矩阵（样本只写代号，证据不入库）
scripts/
  check-rules.mjs    通用规则检查（只查机器能判定的）
tests/               node:test 测试
```

## Agent skills

开发流程用 Matt Pocock skills（`~/.agents/skills/`）：大活走 `to-spec` → `to-tickets` → `implement` / `tdd` → `code-review` → PR；小改（一张 issue、一天内做完）跳过 `to-spec`。Claude 用 `/技能名`，Codex 用 `$技能名`；这几个技能只在点名时加载，不会自动触发。

### Issue tracker

需求、规格与任务用本仓库 GitHub Issues。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个默认分流标签。见 `docs/agents/triage-labels.md`。

### Domain docs

single-context：根目录 `GLOSSARY.md` 与 `docs/adr/`，用到时再建。见 `docs/agents/domain.md`。

改动怎么走、分支怎么起名、交接写在哪、怎么合并：见 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/工程流程.md`。

## 规则

- 验证用的备份、日志等证据放 `~/Library/Application Support/chatgpt-clipper/evidence/`，不放 `/tmp`（全局坑 G-01）；私人数据与完整日志不进仓库。
- 新增依赖先改 `scripts/check-rules.mjs` 的 `ALLOWED_DEPS`，并在交接里说明理由（`check-rules` 会查）。
- 隐私：只处理用户点选的那条回答，全部本地处理，不上传、不加遥测；不保存 cookie、token、localStorage；私人对话内容和截图不进仓库。
- 定位 ChatGPT 页面元素只用稳定的数据属性（如 `data-chatgpt-search-unit-key`），不依赖带哈希后缀的类名；选择器集中在一个适配模块里。
- 笔记和页面上的时间经统一的格式化函数按北京时间显示，不直接截取 ISO 字符串（全局坑 G-02，`check-rules` 会查）。

## AI 接入

本应用当前不调用 AI：定位回答、截长图、生成笔记都在本机浏览器里完成，没有任何内容由 AI 替本应用产出（2026-11-07 核实）。

- 数据对象（只读取、存档，不算执行方）：
  - ChatGPT 网页 `chatgpt.com`：用户点选的那条回答、选中的段落或整段对话，从页面上读取；回答里的图片由后台从 `images.openai.com`、`*.oaiusercontent.com` 取（不带 cookie，见 `wxt.config.ts` 的 `host_permissions`）。
  - Claude 网页 `claude.ai`：只认对话页 `/chat/…`，读取方式同上。
  - 产出写到：用户在设置页选定的 Obsidian 文件夹；没选或写不进时退回 Chrome 下载目录 `chatgpt-clipper/`；单条和节选收藏的长图同时复制到剪贴板（FR-14）；点「导出 PDF」时 PDF 存进 Chrome「下载」根目录（FR-15）。
- 对外开放：无（没有 MCP，没有 `externally_connectable`，不给外部程序或其他扩展留接口）。
- 第一次加 AI 功能时，按全局规则 P-13（`~/.claude/CLAUDE.md` 第 14 节「应用里的 AI 接入写进设置」）补设置栏，并改写本节。

## 交接格式

每轮完成后，在 CURRENT.md 顶部新增一节（旧节保留在下面，过长时归档到 `docs/history/`），骨架照抄 [docs/templates/handoff.md](docs/templates/handoff.md)；`tests/handoff-format.test.mjs` 会检查顶部一节有没有日期、「时间：开工」「测试：」「本轮新坑：」三行，新坑编号在 LESSONS 里要存在。每一行怎么写、报告与验收的防伪造五条见 [OPERATIONS](docs/OPERATIONS.md)「交接写法」「报告与验收」；没做就写「未做」。
