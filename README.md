# ChatGPT 回答收藏器

Chrome 桌面版 MV3 插件，自用。协作约定从 [AGENTS.md](AGENTS.md) 开始读。

## 构建与加载

```sh
npm install
npm run build        # 产物在 .output/chrome-mv3/
```

在 `chrome://extensions` 打开「开发者模式」→「加载已解压的扩展程序」→ 选 `.output/chrome-mv3/`。

首次使用：在插件详情页点「扩展程序选项」（或收藏后进度卡上的「去设置」），选 Vault 里的目标文件夹，建议 `00 待整理/ChatGPT收藏`。

## 测试

```sh
npx playwright install chromium   # 首次：端到端测试要用 Playwright 自带的 Chromium
node --test tests/*.test.mjs
npm run compile                   # 类型检查
```

## 权限

| 权限 | 用途 |
|---|---|
| `downloads` | 写不进 Vault 时（没选文件夹、授权失效、写入出错）退回浏览器下载，把笔记和长图存到下载目录的 `chatgpt-clipper/<日期> <标题>/` 子文件夹 |
| `https://images.openai.com/*`、`https://*.oaiusercontent.com/*` | 长图里画回答中的图片（搜索图、生成图、上传图）。这两个域名不给页面 CORS 头，内容脚本读不到，由后台取回已显示的图片转成内嵌数据；只取图片，不发送任何内容 |
| `debugger` | 一键导出 PDF（FR-15，常浩 2026-11-10 确认）：只接到插件自己开的打印页上，用 `Page.printToPDF` 打印，导完马上断开；导出那一两秒浏览器顶部会出现「已开始调试此浏览器」提示条 |
| `scripting`、`https://chatgpt.com/*`、`https://claude.ai/*` | 插件安装、更新、重新加载后，给已开的这两个站的页面补装内容脚本，不用刷新页面（FR-9，常浩 2026-11-19 同意）。内容脚本的 `matches` 不算 host 权限，没有这两项补装不了（L-24）；后台不向这两个站发请求 |
| 设置页（`options_ui`，不需要权限） | 用 File System Access API 选一次 Vault 里的目标文件夹，目录句柄存在扩展自己的 IndexedDB；授权失效时在这里重新授权；底部显示版本和打包时间，「自检」列出入库各步通不通 |
| 内容脚本 `matches: https://chatgpt.com/*`、`https://claude.ai/*` | 只在 ChatGPT、Claude 页面上挂「收藏」丝带、读取用户点选的那条回答 |

不要 `<all_urls>`、`activeTab`、`storage`、`cookies`：长图用离线快照栅格化（方案 C），不需要截屏；不读写 cookie、token、localStorage。

## 代码结构

```
src/entrypoints/content.ts   内容脚本：挂丝带、改版自检；单条 / 节选收藏（capture → produce 做长图和笔记）、整段收藏（captureThread）和只导 PDF（exportUntil）
src/entrypoints/background.ts 后台：按消息类型分发（handlers）：写 Vault、调 downloads、取跨域图片、打印 PDF；插件更新后给已开页面补装脚本
src/entrypoints/options/     设置页：选 Vault 文件夹、重新授权、填 Obsidian 位置、版本与自检
src/entrypoints/print/       导出 PDF 用的打印页（后台在后台标签页里打开）
src/lib/messages.ts          内容脚本 ↔ 后台的消息：每种消息发什么、回什么；挂哪些页面（PAGES）
src/lib/ask.ts               给后台发消息的唯一入口 ask() / send()，带限时
src/lib/timeout.ts           限时：within()、各处等多久的一张表 LIMITS
src/lib/persist.ts           收藏的后两步：入库（写不进退回下载）→ 结果怎么告诉用户（一张判定表）；不碰页面，可直接测
src/lib/adapter.ts           ChatGPT、Claude 两个站点对象：选择器和页面标记（只此一处，改版只改这里）
src/lib/snapshot.ts          离线快照：内联计算样式 → 内嵌图片字体 → SVG foreignObject → PNG
src/lib/markdown.ts          回答 → Markdown 正文；读全长代码；整篇笔记（frontmatter、提问、长图）
src/lib/thread.ts            整段收藏和只导 PDF：从头滚动，逐条读每一问每一答（只导 PDF 读到被拉的那一条为止）
src/lib/jump.ts              跳回原回答：按笔记链接里的指纹找到那条回答
src/lib/pdf.ts               导出 PDF：把快照副本排成打印页的 HTML，分段送后台
src/lib/vault.ts             写进 Vault 的统一出口，实现按职责分在 vault/ 下：
  vault/store.ts               插件自己的数据库（键值表）和里面存了什么
  vault/fs.ts                  读写 Vault 文件夹的小工具
  vault/dir.ts                 Vault 文件夹的句柄与授权、Obsidian 位置
  vault/journal.ts             已收藏清单、写入队列、写入日志与恢复、整组提交
  vault/save.ts                单条收藏、节选的写入
  vault/staging.ts             整段收藏的写入：预留文件夹、暂存任务
  vault/diag.ts                自检
src/lib/ui.ts                丝带、进度卡、提醒（Shadow DOM）
src/lib/naming.ts            北京时间与收藏文件夹、笔记命名
src/lib/dom.ts               几个模块共用的页面小工具
tests/e2e.test.mjs           端到端测试：Playwright 带插件的 Chromium + 测试页，覆盖全部功能（约 3 分钟，机器很忙时计时类用例会偶发失败）
tests/persist.test.mjs       入库和结果判定表（直接导入 persist.ts、ask.ts）
tests/vault-save.test.mjs    写入 Vault 的存储层测试（内存假文件系统）
tests/fixtures/              自建的仿卡片测试页（无私人内容）
scripts/icon.svg             插件图标源文件；改完运行 node scripts/make-icons.mjs 生成 public/icon/*.png
```
