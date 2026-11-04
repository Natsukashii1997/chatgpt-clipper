import { answerChars, answerFingerprint, answerKey, answerQuestion, answerTitle, findAnswers, inChat, NOISE, SITE_NAME } from '@/lib/adapter';
import { answerToMarkdown, buildNote, readCodeEditors, type CodeRead } from '@/lib/markdown';
import type { DownloadFile, FailCode, Request, Response } from '@/lib/messages';
import { folderName, noteName } from '@/lib/naming';
import { embedResources, styler, takeSnapshot, toPng } from '@/lib/snapshot';
import { mountRibbon, notice, progressCard, STEPS, UI_ATTR, type RibbonState, type Why } from '@/lib/ui';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://claude.ai/*'],
  runAt: 'document_idle',
  main() {
    const scan = () => {
      const check: Ribbon[] = [];
      for (const el of findAnswers()) {
        let r = ribbons.get(el);
        if (!r || !el.querySelector(`:scope > [${UI_ATTR}]`)) {
          const ribbon = mountRibbon(el, () => capture(el, r!.set));
          const fresh: Ribbon = { el, state: 'idle', text: -1, set: s => { fresh.state = s; ribbon.set(s); } };
          ribbons.set(el, (r = fresh));
        }
        // 回答文字常晚于丝带出来（流式输出、页面分批渲染）：文字变了就重新查一次是否收藏过
        const len = el.textContent?.length ?? 0;
        if (r.state === 'idle' && len !== r.text) { r.text = len; check.push(r); }
      }
      if (check.length) void markSaved(check);
      watchChat();
    };
    // 新回答、切换对话时补挂丝带；React 重绘掉了也补回来
    let pending = 0;
    new MutationObserver(() => {
      if (!pending) pending = window.setTimeout(() => { pending = 0; scan(); }, 300);
    }).observe(document.body, { childList: true, subtree: true });
    scan();
  },
});

// 改版自检（2026-11-04 用户选定 A 版）：打开对话 10 秒后一条回答都没认出来，提醒一次（每个对话一次）
const CHECK_AFTER = 10_000;
let watched = '', watchTimer = 0;
const warned = new Set<string>();
function watchChat() {
  if (location.href === watched) return;
  watched = location.href;
  clearTimeout(watchTimer);
  if (!inChat()) return;
  const url = location.href;
  watchTimer = window.setTimeout(() => {
    if (location.href !== url || warned.has(url) || findAnswers().length) return;
    warned.add(url);
    notice('收藏按钮没挂上', `这页有对话，但插件没认出回答，${SITE_NAME} 可能改版了。`);
  }, CHECK_AFTER);
}

interface Ribbon { el: HTMLElement; state: RibbonState; text: number; set: (s: RibbonState) => void }
const ribbons = new WeakMap<HTMLElement, Ribbon>();

/** 收藏过的回答，丝带显示「已收藏」 */
async function markSaved(list: Ribbon[]) {
  const ids = await Promise.all(list.map(r => answerFingerprint(r.el)));
  const res = (await browser.runtime.sendMessage({ type: 'saved', ids } satisfies Request).catch(() => undefined)) as Response | undefined;
  if (res?.ok) list.forEach((r, i) => { if (r.state === 'idle' && res.saved?.includes(ids[i]!)) r.set('done'); });
}

const busy = new WeakSet<HTMLElement>();

async function capture(el: HTMLElement, setRibbon: (s: RibbonState) => void) {
  if (busy.has(el)) return;
  busy.add(el);
  setRibbon('busy');
  // 回答没有标题就用提问，最多 30 字（M1 验收 P12）
  const title = (answerTitle(el) || answerQuestion(el).replace(/\s+/g, ' ').trim().slice(0, 30)).slice(0, 120), started = new Date(), id = await answerFingerprint(el);
  const card = progressCard();
  const files: DownloadFile[] = [], failed: string[] = [], warns: string[] = [];
  // 改版自检：先量页面上的这条回答，结果明显比它少就照样存、标黄
  const pageChars = answerChars(el), pageHeight = Math.round(el.getBoundingClientRect().height);
  const fail = (i: number, what: string, e: unknown, short = '失败') => {
    const reason = e instanceof Error ? e.message : String(e);
    card.step(i, 'bad', short);
    failed.push(what ? `${what}：${reason}` : reason);
    console.error(`[chatgpt-clipper] ${answerKey(el)} ${what || STEPS[i]}失败`, e);
  };
  try {
    card.step(0, 'on');
    await nextFrame();
    let snap, code: Map<Element, CodeRead> | undefined;
    try {
      // 长代码先读全，读的时候把每行连样式复制下来给长图用；转 MD 用同一份，不再滚第二遍
      const st = styler();
      try {
        code = await readCodeEditors(el, l => st.copy(l));
      } finally {
        st.dispose();
      }
      snap = takeSnapshot(el, { exclude: `[${UI_ATTR}]`, drop: NOISE, codeLines: new Map([...code].map(([e, c]) => [e, c.lines])) });
      card.step(0, 'ok');
    } catch (e) {
      fail(0, '快照', e);
    }
    if (snap) {
      card.step(1, 'on');
      await nextFrame();
      try {
        await embedResources(snap, fetchImage);
        files.push({ name: 'answer.png', url: await blobToDataUrl(await toPng(snap)) });
        const short = snap.height < pageHeight / 2;
        if (short) warns.push(`长图只有页面高度的 ${Math.round((snap.height / pageHeight) * 100)}%`);
        card.step(1, short ? 'warn' : 'ok', `${snap.height}px`);
      } catch (e) {
        fail(1, 'PNG 文件', e);
      }
    }
    card.step(2, 'on');
    await nextFrame();
    try {
      const body = answerToMarkdown(el, { exclude: `[${UI_ATTR}]`, code: code ?? (await readCodeEditors(el)) });
      // 回答本身很短（不到 20 字）不比字数
      const chars = body.replace(/\s+/g, '').length, few = pageChars >= 20 && chars < pageChars / 2;
      if (few) warns.push(chars ? `笔记只读到页面文字的 ${Math.round((chars / pageChars) * 100)}%` : '笔记没读到正文');
      const md = buildNote({ url: `${location.origin}${location.pathname}`, captured: started, title, question: answerQuestion(el), body, image: files.length > 0, warn: warns });
      files.unshift({ name: noteName(title), url: `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}` });
      card.step(2, few ? 'warn' : 'ok', `${body.length} 字`);
    } catch (e) {
      fail(2, 'MD 文件', e);
    }
    const partial = failed.length > 0;   // 快照、PNG 或 MD 没做成，存下来的不完整
    let savedTo = '', firstId = 0, fix: FailCode | undefined, note = '', got = '', why: Why | undefined;
    if (files.length) {
      card.step(3, 'on');
      const folder = folderName(title, started);
      const res = (await browser.runtime.sendMessage({ type: 'save', id, folder, files } satisfies Request).catch((e: Error) => ({ ok: false, error: e.message }))) as Response | undefined;
      if (res?.ok) {
        savedTo = res.path ?? '';
        note = res.moved ? '已收藏过' : res.updated ? '已更新' : '已存入';
        if (!res.moved && files[0]?.name.endsWith('.md')) why = { value: res.why ?? '', save: w => send({ type: 'why', id, why: w }).then(() => undefined) };
        card.step(3, 'ok', note);
      } else {
        // 写不进 Vault：退回浏览器下载，并说明原因（FR-5）。没选 Vault 文件夹（比如没装 Obsidian）只下载长图（2026-11-03 用户决定）
        fix = res?.code;
        const noVault = fix === 'no-folder', png = files.filter(f => f.name === 'answer.png');
        const dl = noVault && png.length ? png : files;
        if (noVault) card.step(3, 'bad', '无 Obsidian');
        else fail(3, '', new Error(res?.error ?? '后台无响应'), fix === 'no-permission' ? '授权失效' : '失败');
        try {
          firstId = (await send({ type: 'download', folder, files: dl })).ids?.[0] ?? 0;
          got = dl === png ? '长图' : '文件';
        } catch (e) {
          failed.push(`退回下载也失败：${e instanceof Error ? e.message : String(e)}`);
        }
        if (noVault) failed.unshift(got ? `无 Obsidian，${got}已下载到 Chrome` : '无 Obsidian，无法保存');
      }
    }
    // 顶部写收藏状态；底部第一行回答标题，第二行日期 · 收藏文件夹（用户 2026-11-02 要求日期单独一行、标题不重复）
    const [dir = '', ...rest] = savedTo.split('/'), sub = rest.join('/'), date = sub.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
    const name = sub.slice(date.length).trim() || title || '这条回答';
    if (!failed.length) {
      setRibbon('done');
      const warn = warns.length > 0 && note !== '已收藏过';
      card.finish(true, note === '已收藏过' ? '已收藏过' : warn ? '已收藏，但可能不完整' : note === '已更新' ? '已更新' : '已收藏', note === '已收藏过'
        ? { icon: '📁', head: name, sub: `原文件夹已不在「${dir}」里（可能整理走了），这次没有重写` }
        : warn ? { icon: '⚠️', head: warns.join('；'), sub: '页面可能改版了，能存的部分已存好', warn }
        : { icon: '📁', head: name, sub: [date, dir].filter(Boolean).join(' · ') }, undefined, warn ? 0 : 8000, why);
    } else {
      setRibbon('err');
      const headline = savedTo ? '已收藏（不完整）' : !firstId ? '收藏失败'
        : fix === 'no-folder' ? `无法保存，${got}已下载` : `已存到下载目录${partial ? '（不完整）' : ''}`;
      const action = fix
        ? { label: fix === 'no-folder' ? '去设置' : '去授权', run: () => void send({ type: 'options' }) }
        : { label: '重试', run: () => { card.close(); busy.delete(el); void capture(el, setRibbon); } };
      card.finish(false, headline, { icon: savedTo ? '📁' : firstId ? '⬇️' : '⚠️', head: name, sub: failed.join('；') }, action);
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

/** 跨域图片交给后台取（内容脚本受页面 CORS 限制） */
async function fetchImage(url: string): Promise<string> {
  const res = (await browser.runtime.sendMessage({ type: 'image', url } satisfies Request)) as Response | undefined;
  if (!res?.ok || !res.dataUrl) throw new Error(res && !res.ok ? res.error : '图片取不到');
  return res.dataUrl;
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
