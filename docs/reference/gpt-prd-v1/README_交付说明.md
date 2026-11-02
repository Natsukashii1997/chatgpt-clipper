# PRD 交付说明

## 文件

- `ChatGPT高保真可编辑导出器_PRD_v1.0.md`：Markdown 源文档（推荐给 Claude Code）。
- `ChatGPT高保真可编辑导出器_PRD_v1.0.docx`：排版 Word 文档（便于审阅与修改）。
- `assets/reference_chatgpt.png`：用户提供的 ChatGPT 业务逻辑图，作为第一验收场景。
- `CLAUDE_开工指令.md`：交给 Claude Code 的执行指令。

## 使用方法

将本 ZIP 整体交给 Claude Code，让其先阅读 PRD 和开工指令，再基于参考图片完成 M0 PoC。待 M0 的真实原图对比与可编辑证明通过后，再进入 M1。

## 核心验收注意

不接受把整张 PNG 放入 HTML/Figma 充当“可编辑”结果。必须有真实可选中的独立文本、卡片和箭头，并对不能恢复原始数据的图表作分级提示。
