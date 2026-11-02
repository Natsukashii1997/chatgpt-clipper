import { DOWNLOAD_ROOT, type Request, type Response } from '@/lib/messages';
import { dirState, getSaved, loadDir, saveCollection } from '@/lib/vault';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Request, _sender, reply: (r: Response) => void) => {
    handle(msg).then(reply, (e: Error) => reply({ ok: false, error: e.message }));
    return true;
  });
});

async function handle(msg: Request): Promise<Response> {
  if (msg.type === 'save') {
    const dir = await loadDir(), state = await dirState(dir);
    if (!dir) return { ok: false, code: 'no-folder', error: '还没选 Vault 文件夹' };
    if (state !== 'granted') return { ok: false, code: 'no-permission', error: `文件夹「${dir.name}」的授权已失效` };
    const files = await Promise.all(msg.files.map(async f => ({ name: f.name, data: await (await fetch(f.url)).blob() })));
    const r = await saveCollection(dir, msg.id, msg.folder, files);
    return { ok: true, path: `${dir.name}/${r.name}`, updated: r.updated, moved: r.moved };
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
  if (msg.type === 'options') {
    await browser.runtime.openOptionsPage();
    return { ok: true };
  }
  return { ok: false, error: '未知消息' };
}
