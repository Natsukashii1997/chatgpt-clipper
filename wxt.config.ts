import { defineConfig } from 'wxt';

// 权限按最小原则：只要 downloads（把长图 PNG 存进下载目录的子文件夹）；
// 页面访问只来自内容脚本的 matches（https://chatgpt.com/*），不要 <all_urls>、debugger、activeTab。
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'ChatGPT 回答收藏器',
    description: '把 ChatGPT 的某条回答原样存成长图 PNG。全部本地处理，不上传。',
    permissions: ['downloads'],
  },
});
