import { DOWNLOAD_ROOT, type Request, type Response } from '@/lib/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Request, _sender, reply: (r: Response) => void) => {
    handle(msg).then(reply, (e: Error) => reply({ ok: false, error: e.message }));
    return true;
  });
});

async function handle(msg: Request): Promise<Response> {
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
  return { ok: false, error: '未知消息' };
}
