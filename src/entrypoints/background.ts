import { DOWNLOAD_ROOT, type Request, type Response } from '@/lib/messages';
import { dirState, getSaved, loadDir, saveCollection, saveWhy } from '@/lib/vault';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Request, _sender, reply: (r: Response) => void) => {
    handle(msg).then(reply, (e: Error) => reply({ ok: false, error: e.message }));
    return true;
  });
});

async function handle(msg: Request): Promise<Response> {
  if (msg.type === 'save' || msg.type === 'why') {
    const dir = await loadDir(), state = await dirState(dir);
    if (!dir) return { ok: false, code: 'no-folder', error: '还没选 Vault 文件夹' };
    if (state !== 'granted') return { ok: false, code: 'no-permission', error: `文件夹「${dir.name}」的授权已失效` };
    if (msg.type === 'why') {
      await saveWhy(dir, msg.id, msg.why);
      return { ok: true };
    }
    const files = await Promise.all(msg.files.map(async f => ({ name: f.name, data: await (await fetch(f.url)).blob() })));
    const r = await saveCollection(dir, msg.id, msg.folder, files);
    return { ok: true, path: `${dir.name}/${r.name}`, updated: r.updated, moved: r.moved, why: r.why };
  }
  if (msg.type === 'saved') {
    const hit = await Promise.all(msg.ids.map(getSaved));
    return { ok: true, saved: msg.ids.filter((_, i) => hit[i]) };
  }
  if (msg.type === 'download') {
    const ids: number[] = [];
    for (const f of msg.files)
      ids.push(await browser.downloads.download({ url: f.url, filename: `${DOWNLOAD_ROOT}/${msg.folder}/${f.name}`, conflictAction: 'uniquify', saveAs: false }));
    return { ok: true, ids };
  }
  if (msg.type === 'show') {
    browser.downloads.show(msg.id);
    return { ok: true };
  }
  if (msg.type === 'image') return { ok: true, dataUrl: await imageDataUrl(msg.url) };
  if (msg.type === 'options') {
    await browser.runtime.openOptionsPage();
    return { ok: true };
  }
  return { ok: false, error: '未知消息' };
}

// 长图里的跨域图片：页面不给 CORS 头，内容脚本读不到，由后台按 host_permissions 取（用户 2026-11-02 同意只加这两个域名）。
// 和 wxt.config.ts 的 host_permissions 保持一致；只取图片，不带任何东西出去
const IMAGE_HOSTS = /^(images\.openai\.com|([\w-]+\.)+oaiusercontent\.com)$/;

async function imageDataUrl(url: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !IMAGE_HOSTS.test(u.hostname)) throw new Error(`不取这个域名的图片：${u.hostname}`);
  const res = await fetch(u, { credentials: 'omit' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) throw new Error(`图片取不到：${res.status} ${type}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type.split(';')[0]};base64,${btoa(bin)}`;
}
