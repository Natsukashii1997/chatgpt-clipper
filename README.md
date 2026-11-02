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
| 设置页（`options_ui`，不需要权限） | 用 File System Access API 选一次 Vault 里的目标文件夹，目录句柄存在扩展自己的 IndexedDB；授权失效时在这里重新授权 |
| 内容脚本 `matches: https://chatgpt.com/*` | 只在 ChatGPT 页面上挂「收藏」按钮、读取用户点选的那条回答 |

不要 `debugger`、`<all_urls>`、`activeTab`、`storage`、`cookies`：长图用离线快照栅格化（方案 C），不需要截屏；不读写 cookie、token、localStorage。

## 代码结构

```
src/entrypoints/content.ts   挂按钮、串起快照 → 长图 → 转文字 → 写入（失败退回下载）
src/entrypoints/background.ts 写 Vault、调 downloads、打开设置页
src/entrypoints/options/     设置页：选 Vault 文件夹、重新授权
src/lib/vault.ts             目录句柄的存取、授权状态、写一条收藏（同名加序号）
src/lib/adapter.ts           ChatGPT 页面选择器（只此一处）
src/lib/snapshot.ts          离线快照：内联计算样式 → SVG foreignObject → PNG
src/lib/markdown.ts          回答 → Markdown 正文与整篇笔记（frontmatter、提问、长图）
src/lib/ui.ts                书签丝带与进度卡（Shadow DOM）
src/lib/naming.ts            北京时间与收藏文件夹命名
tests/fixtures/              自建的仿卡片测试页（无私人内容）
scripts/icon.svg             插件图标源文件；改完运行 node scripts/make-icons.mjs 生成 public/icon/*.png
```
