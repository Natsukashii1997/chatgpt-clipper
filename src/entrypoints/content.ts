import { answerKey, answerTitle, findAnswers } from '@/lib/adapter';
import type { DownloadFile, Request, Response } from '@/lib/messages';
import { folderName } from '@/lib/naming';
import { takeSnapshot, toPng } from '@/lib/snapshot';
import { mountRibbon, progressCard, UI_ATTR, type RibbonState } from '@/lib/ui';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_idle',
  main() {
    const mounted = new WeakSet<HTMLElement>();
    const scan = () => {
      for (const el of findAnswers()) {
        if (mounted.has(el) && el.querySelector(`:scope > [${UI_ATTR}]`)) continue;
        mounted.add(el);
        const ribbon = mountRibbon(el, () => capture(el, ribbon.set));
      }
    };
    // 新回答、切换对话时补挂丝带；React 重绘掉了也补回来
    let pending = 0;
    new MutationObserver(() => {
      if (!pending) pending = window.setTimeout(() => { pending = 0; scan(); }, 300);
    }).observe(document.body, { childList: true, subtree: true });
    scan();
  },
});

const busy = new WeakSet<HTMLElement>();

async function capture(el: HTMLElement, setRibbon: (s: RibbonState) => void) {
  if (busy.has(el)) return;
  busy.add(el);
  setRibbon('busy');
  const title = answerTitle(el).slice(0, 40), started = new Date();
  const card = progressCard(title);
  const files: DownloadFile[] = [], failed: string[] = [];
  const fail = (i: number, what: string, e: unknown) => {
    const reason = e instanceof Error ? e.message : String(e);
    card.step(i, 'bad', reason);
    failed.push(`${what}：${reason}`);
    console.error(`[chatgpt-clipper] ${answerKey(el)} ${what}失败`, e);
  };
  try {
    card.step(0, 'on');
    await nextFrame();
    let snap;
    try {
      snap = takeSnapshot(el, { exclude: `[${UI_ATTR}]` });
      card.step(0, 'ok', `${snap.nodes} 个节点`);
    } catch (e) {
      fail(0, '快照', e);
    }
    if (snap) {
      card.step(1, 'on');
      await nextFrame();
      try {
        files.push({ name: 'answer.png', url: await blobToDataUrl(await toPng(snap)) });
        card.step(1, 'ok', `${snap.width}×${snap.height}`);
      } catch (e) {
        fail(1, '长图', e);
      }
    }
    let firstId = 0;
    if (files.length) {
      card.step(2, 'on');
      try {
        const res = await send({ type: 'download', folder: folderName(title, started), files });
        firstId = res.ids?.[0] ?? 0;
        card.step(2, 'ok');
      } catch (e) {
        fail(2, '下载', e);
      }
    }
    const show = firstId ? { label: '在文件夹中显示', run: () => void send({ type: 'show', id: firstId }) } : undefined;
    if (!failed.length) {
      setRibbon('done');
      card.finish(true, files.map(f => f.name).join(' · '), show, 8000);
    } else {
      setRibbon('err');
      const saved = firstId ? `已下载 ${files.map(f => f.name).join('、')}（不完整）` : '未生成任何文件';
      card.finish(false, `${saved}；${failed.join('；')}`, { label: '重试', run: () => { card.close(); busy.delete(el); void capture(el, setRibbon); } });
    }
  } finally {
    busy.delete(el);
  }
}

async function send(msg: Request): Promise<Extract<Response, { ok: true }>> {
  const res = (await browser.runtime.sendMessage(msg)) as Response | undefined;
  if (!res) throw new Error('后台无响应');
  if (!res.ok) throw new Error(res.error);
  return res;
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(b);
  });
}

// 让进度卡先画出来，再做会卡住主线程的快照
const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 0)));
