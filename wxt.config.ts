import { defineConfig } from 'wxt';

// 权限按最小原则：downloads（写不进 Vault 时退回下载、导出 PDF 存进「下载」）；两个 OpenAI 图片域名（后台取回答里的图片画进长图，
// 页面不给 CORS 头，用户 2026-11-02 同意）。页面访问只来自内容脚本的 matches（https://chatgpt.com/*、https://claude.ai/*，后者用户 2026-11-03 同意），
// 不要 <all_urls>、activeTab。debugger 只为一键导出 PDF（FR-15，常浩 2026-11-10 确认）：只接到插件自己开的打印页上，
// 导完马上断开；导出那一两秒浏览器顶部会出现「已开始调试此浏览器」提示条。
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'AI 回答收藏器',
    description: '把 ChatGPT 或 Claude 的某条回答存成长图和 Markdown 笔记，写进 Obsidian。全部本地处理，不上传。',
    permissions: ['downloads', 'debugger'],
    host_permissions: ['https://images.openai.com/*', 'https://*.oaiusercontent.com/*'],
  },
});
