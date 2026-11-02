# 原型① 长图截取三方案（一次性，验完即弃）

比较 PRD 第 5 节的三种长图方案：A CDP 撑高视口后按节点截图；B 滚动分段 + captureVisibleTab 拼接；C 离线快照 → SVG foreignObject 栅格化。

加载：Chrome 打开 `chrome://extensions` → 右上角开「开发者模式」→「加载已解压的扩展程序」→ 选本目录。
使用：打开 ChatGPT 对话，右上角出现面板；下拉框选一条回答，依次点 A / B / C。结果存到 `~/Downloads/chatgpt-clipper-proto/`（`<轮次>-<方案>.png/.json`，C 另有 `.html`）。
权限说明：原型为省事用了 `<all_urls>` 和 `debugger`；正式版按 PRD 改为最小权限。
