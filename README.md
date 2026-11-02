# ChatGPT 回答收藏器

Chrome 桌面版 MV3 插件，自用。协作约定从 [AGENTS.md](AGENTS.md) 开始读。

## 构建与加载

```sh
npm install
npm run build        # 产物在 .output/chrome-mv3/
```

在 `chrome://extensions` 打开「开发者模式」→「加载已解压的扩展程序」→ 选 `.output/chrome-mv3/`。

## 测试

```sh
npx playwright install chromium   # 首次：端到端测试要用 Playwright 自带的 Chromium
node --test tests/*.test.mjs
npm run compile                   # 类型检查
```

## 权限

| 权限 | 用途 |
|---|---|
| `downloads` | 把 `answer.png` 存到下载目录的 `chatgpt-clipper/<北京时间> <标题>/` 子文件夹；完成后「在文件夹中显示」 |
| 内容脚本 `matches: https://chatgpt.com/*` | 只在 ChatGPT 页面上挂「收藏」按钮、读取用户点选的那条回答 |

不要 `debugger`、`<all_urls>`、`activeTab`、`storage`、`cookies`：长图用离线快照栅格化（方案 C），不需要截屏；不读写 cookie、token、localStorage。

## 代码结构

```
src/entrypoints/content.ts   挂按钮、串起快照 → 长图 → 下载
src/entrypoints/background.ts 调 downloads
src/lib/adapter.ts           ChatGPT 页面选择器（只此一处）
src/lib/snapshot.ts          离线快照：内联计算样式 → SVG foreignObject → PNG
src/lib/ui.ts                书签丝带与进度卡（Shadow DOM）
src/lib/naming.ts            北京时间与下载文件夹命名
tests/fixtures/              自建的仿卡片测试页（无私人内容）
```
