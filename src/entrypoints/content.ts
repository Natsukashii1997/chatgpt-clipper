import { answerBlocks, answerChars, answerFingerprint, countQuestions, answerKey, answerQuestion, answerTitle, findAnswers, inChat, NOISE, repairRequest, selectedBlocks, SITE_NAME, userText } from '@/lib/adapter';
import { answerToMarkdown, buildNote, buildThreadNote, readCodeEditors, type CodeRead, type ThreadRound } from '@/lib/markdown';
import { PAGES, type DownloadFile, type FailCode, type Request, type Response } from '@/lib/messages';
import { clipHash, jumpToClip } from '@/lib/jump';
import { beijingTime, folderName, noteName } from '@/lib/naming';
import { exportPdf, pdfAnswer, type PdfAnswer, type PdfDoc, type PdfRound } from '@/lib/pdf';
import { embedResources, styler, takeSnapshot, toPng } from '@/lib/snapshot';
import { readThread } from '@/lib/thread';
import { mountRibbon, notice, progressCard, STEPS, UI_ATTR, type Pdf, type Place, type RibbonState } from '@/lib/ui';

export default defineContentScript({
  matches: PAGES,
  runAt: 'document_idle',
  main(ctx) {
    // 插件更新或重新加载后，后台给已开的页面补装一份新脚本（FR-9）。新的一份启动时，WXT 通知旧的一份作废：
    // 旧的停掉监听和计时，收起自己挂的丝带、进度卡和提醒，让新的一份重新挂。作废通知是同步的，新的一份挂丝带之前旧的已收完
    ctx.onInvalidated(() => {
      observer.disconnect();
      clearTimeout(pending);
      cancelAnimationFrame(picking);
      clearTimeout(watchTimer);
      document.querySelectorAll(`[${UI_ATTR}]`).forEach(n => n.remove());
    });
    const scan = () => {
      const check: Ribbon[] = [];
      for (const el of findAnswers()) {
        let r = ribbons.get(el);
        if (!r || !el.querySelector(`:scope > [${UI_ATTR}]`)) {
          const ribbon = mountRibbon(el, () => {
            const blocks = picked(el);
            // 节选不改丝带的收藏状态：收的时候转蓝，收完恢复
            if (blocks.length) void capture(el, s => ribbon.set(s === 'busy' ? 'busy' : r!.state), blocks);
            else void capture(el, r!.set);
          }, () => void captureThread());
          const fresh: Ribbon = { el, state: 'idle', text: -1, set: s => { fresh.state = s; ribbon.set(s); }, pick: ribbon.pick };
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
    let pending = 0, picking = 0;
    const observer = new MutationObserver(() => {
      if (!pending) pending = window.setTimeout(() => { pending = 0; scan(); }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    // 选中文字时，选区所在回答的丝带变荧光笔（作废时 ctx 自动摘掉监听）
    ctx.addEventListener(document, 'selectionchange', () => {
      if (!picking) picking = requestAnimationFrame(() => {
        picking = 0;
        for (const el of findAnswers()) ribbons.get(el)?.pick(picked(el).length);
      });
    });
  },
});

/** 当前选区碰到的这条回答里的块 */
function picked(el: HTMLElement): HTMLElement[] {
  const s = getSelection();
  if (!s?.rangeCount || s.isCollapsed) return [];
  const r = s.getRangeAt(0);
  return r.intersectsNode(el) ? selectedBlocks(el, r) : [];
}

// 进入对话页：带 #clip- 的（从笔记跳回）去找那条回答。
// 改版自检（2026-11-04 用户选定 A 版）：页面上已有两个以上提问、却一条回答都没认出来，并且页面静止 10 秒还这样，才提醒（每个对话一次）。
// 页面还在加载（提问还没出来）、第一问还在生成（只有一个提问）都不算；提醒之后认出回答了、或换了对话，提醒自动收起（2026-11-07 常浩反馈：丝带挂上了还在提醒、页面没加载完就先弹）。
// 2026-11-11 常浩反馈提醒只说「可能改版了」、不知道怎么办，选 C 版「查清了才提醒」：页面还在变（生成中、加载中）就重新计时；
// 插件更新过、页面还连着旧插件，提醒刷新；排除这些才说改版，提醒上直接给「复制修复请求」
const CHECK_AFTER = 10_000;
let watched = '', watchTimer = 0, toast: HTMLElement | undefined, stale = false;
const warned = new Set<string>();
const missing = () => inChat() && !findAnswers().length && countQuestions() >= 2;
const pageText = () => (document.querySelector('main') ?? document.body).textContent ?? '';

/** 页面静止 10 秒仍认不出回答才提醒。扫描由 DOM 增删触发，每次扫描都重新计时；
 *  只改文字不增删节点的（流式输出、「思考 N 秒」计时）扫描看不到，到点时比一下文字，变了也重新计时 */
function arm(url: string) {
  clearTimeout(watchTimer);
  const before = pageText();
  watchTimer = window.setTimeout(() => {
    watchTimer = 0;
    if (location.href !== url || !missing()) return;
    if (pageText() !== before) return arm(url);
    warned.add(url);
    toast = notice(`${SITE_NAME} 改版了，收藏暂时用不了`,
      `页面上有 ${countQuestions()} 个提问，插件一条回答都没认出来，页面也没在生成或加载。这要改插件代码：复制修复请求，粘贴给 Claude。`,
      [{ label: '复制修复请求', run: copyRepair }]);
  }, CHECK_AFTER);
}

async function copyRepair(): Promise<string> {
  const { date, time } = beijingTime(new Date());
  try {
    await navigator.clipboard.writeText(repairRequest(`${date} ${time}`, browser.runtime.getManifest().version));
    return '✓ 已复制。到 Claude Code 里 chatgpt-clipper 项目的会话粘贴发送。';
  } catch {
    return '没复制成：浏览器没让写剪贴板。点一下页面再试，或刷新页面。';
  }
}

function watchChat() {
  // 插件更新或重新加载后，这页的脚本就断开了，点丝带存不上：提醒刷新（每页一次）
  if (!browser.runtime?.id) {
    clearTimeout(watchTimer);
    if (!stale && inChat()) {
      stale = true;
      toast?.remove();
      toast = notice('插件已更新，刷新这页才能收藏', '这个页面还连着更新前的插件，点丝带会存不上。', [{ label: '刷新页面', run: () => location.reload() }]);
    }
    return;
  }
  if (location.href !== watched) {
    watched = location.href;
    clearTimeout(watchTimer);
    watchTimer = 0;
    toast?.remove();
    if (inChat()) void jumpToClip();
  }
  if (!missing()) {
    clearTimeout(watchTimer);
    watchTimer = 0;
    if (findAnswers().length) toast?.remove();
    return;
  }
  if (!warned.has(watched)) arm(watched);
}

interface Ribbon { el: HTMLElement; state: RibbonState; text: number; set: (s: RibbonState) => void; pick: (n: number) => void }
const ribbons = new WeakMap<HTMLElement, Ribbon>();

/** 收藏过的回答，丝带显示「已收藏」 */
async function markSaved(list: Ribbon[]) {
  const ids = await Promise.all(list.map(r => answerFingerprint(r.el)));
  const res = (await browser.runtime.sendMessage({ type: 'saved', ids } satisfies Request).catch(() => undefined)) as Response | undefined;
  if (res?.ok) list.forEach((r, i) => { if (r.state === 'idle' && res.saved?.includes(ids[i]!)) r.set('done'); });
}

const busy = new WeakSet<HTMLElement>();

// 只收选中段落时，没选中的部分打上这个属性，长图和笔记都去掉，收完清掉
const CUT = 'data-clipper-cut';

/** blocks：只收这几块（节选，FR-12）。单独一条收藏：指纹是回答指纹加块序号，文件夹名带「（节选）」，不覆盖整条收藏 */
async function capture(el: HTMLElement, setRibbon: (s: RibbonState) => void, blocks?: HTMLElement[]) {
  if (busy.has(el)) return;
  busy.add(el);
  // 要在第一个 await 之前：还在点击里，剪贴板才肯收
  const clip = copyLater();
  setRibbon('busy');
  // 回答没有标题就用提问，最多 30 字（M1 验收 P12）
  const title = (answerTitle(el) || answerQuestion(el).replace(/\s+/g, ' ').trim().slice(0, 30)).slice(0, 120), started = new Date(), answerId = await answerFingerprint(el);
  const all = blocks && answerBlocks(el), id = blocks ? `${answerId}~${blocks.map(b => all!.indexOf(b)).join('-')}` : answerId;
  const card = progressCard();
  const files: DownloadFile[] = [], failed: string[] = [], warns: string[] = [];
  // 改版自检：先量页面上的这条回答（节选量选中的块），结果明显比它少就照样存、标黄
  const parts = blocks ?? [el];
  const pageChars = parts.reduce((n, b) => n + answerChars(b), 0), pageHeight = Math.round(parts.reduce((n, b) => n + b.getBoundingClientRect().height, 0));
  // 长图里没选中的部分走 drop（去掉后重新量高），笔记里跳过
  const drop = [NOISE, blocks && `[${CUT}]`].filter(Boolean).join(', '), skip = [`[${UI_ATTR}]`, blocks && `[${CUT}]`].filter(Boolean).join(', ');
  const fail = (i: number, what: string, e: unknown, short = '失败') => {
    const reason = e instanceof Error ? e.message : String(e);
    card.step(i, 'bad', short);
    failed.push(what ? `${what}：${reason}` : reason);
    console.error(`[chatgpt-clipper] ${answerKey(el)} ${what || STEPS[i]}失败`, e);
  };
  try {
    if (blocks) cut(el, new Set(blocks));
    card.step(0, 'on');
    await nextFrame();
    let snap, code: Map<Element, CodeRead> | undefined, pdfAns: PdfAnswer | undefined;
    try {
      // 长代码先读全，读的时候把每行连样式复制下来给长图用；转 MD 用同一份，不再滚第二遍
      const st = styler();
      try {
        code = await readCodeEditors(el, l => st.copy(l));
      } finally {
        st.dispose();
      }
      snap = takeSnapshot(el, { exclude: `[${UI_ATTR}]`, drop, codeLines: new Map([...code].map(([e, c]) => [e, c.lines])) });
      card.step(0, 'ok');
    } catch (e) {
      fail(0, '快照', e);
    }
    if (snap) {
      card.step(1, 'on');
      await nextFrame();
      try {
        await embedResources(snap, fetchImage);
        pdfAns = pdfAnswer(snap);
        const png = await toPng(snap);
        clip.give(png);
        files.push({ name: 'answer.png', url: await blobToDataUrl(png) });
        const short = snap.height < pageHeight / 2;
        if (short) warns.push(`长图只有页面高度的 ${Math.round((snap.height / pageHeight) * 100)}%`);
        card.step(1, short ? 'warn' : 'ok', `${snap.height}px · ${(await clip.done()) ?'已复制' : '未复制'}`);
      } catch (e) {
        fail(1, 'PNG 文件', e);
      }
    }
    clip.drop();   // 长图没做成：放弃这次复制（已交出去的不受影响）
    card.step(2, 'on');
    await nextFrame();
    try {
      const body = answerToMarkdown(el, { exclude: skip, code: code ?? (await readCodeEditors(el)) });
      // 回答本身很短（不到 20 字）不比字数
      const chars = body.replace(/\s+/g, '').length, few = pageChars >= 20 && chars < pageChars / 2;
      if (few) warns.push(chars ? `笔记只读到页面文字的 ${Math.round((chars / pageChars) * 100)}%` : '笔记没读到正文');
      const md = buildNote({ url: `${location.origin}${location.pathname}${clipHash(answerId)}`, captured: started, title, question: answerQuestion(el), body, image: files.length > 0, warn: warns, excerpt: !!blocks });
      files.unshift({ name: noteName(title), url: `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}` });
      card.step(2, few ? 'warn' : 'ok', `${body.length} 字`);
    } catch (e) {
      fail(2, 'MD 文件', e);
    }
    const partial = failed.length > 0;   // 快照、PNG 或 MD 没做成，存下来的不完整
    // 导出 PDF（FR-15）：快照做成了就能导，和存没存进 Obsidian 无关；节选只有选中的那几块。文件名同收藏文件夹
    const pdf = pdfAns && pdfAction({ title: blocks ? `${title}（节选）` : title, site: SITE_NAME, url: `${location.origin}${location.pathname}${clipHash(answerId)}`,
      captured: started, rounds: [{ question: answerQuestion(el), answers: [pdfAns] }] }, `${folderName(title, started)}${blocks ? '（节选）' : ''}`);
    let savedTo = '', firstId = 0, fix: FailCode | undefined, note = '', got = '', open: Place['open'];
    if (files.length) {
      card.step(3, 'on');
      const folder = `${folderName(title, started)}${blocks ? '（节选）' : ''}`;
      const res = (await browser.runtime.sendMessage({ type: 'save', id, folder, files } satisfies Request).catch((e: Error) => ({ ok: false, error: e.message }))) as Response | undefined;
      if (res?.ok) {
        savedTo = res.path ?? '';
        note = res.moved ? '已收藏过' : res.updated ? '已更新' : '已存入';
        if (!res.moved && files[0]?.name.endsWith('.md')) {
          // 点绿块在 Obsidian 里打开；没设置位置时点了去设置页
          open = res.open ? { label: '在 Obsidian 里打开 ↗', href: res.open, run: () => openLink(res.open!) }
            : { label: '设置 Obsidian 位置后可直接打开 ↗', run: () => void send({ type: 'options' }) };
        }
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
        : warn ? { icon: '⚠️', head: warns.join('；'), sub: '页面可能改版了，能存的部分已存好', warn, open }
        : { icon: '📁', head: name, sub: [date, dir].filter(Boolean).join(' · '), open }, undefined, warn ? 0 : 8000, pdf);
    } else {
      setRibbon('err');
      const headline = savedTo ? '已收藏（不完整）' : !firstId ? '收藏失败'
        : fix === 'no-folder' ? `无法保存，${got}已下载` : `已存到下载目录${partial ? '（不完整）' : ''}`;
      const action = fix
        ? { label: fix === 'no-folder' ? '去设置' : '去授权', run: () => void send({ type: 'options' }) }
        : { label: '重试', run: () => { card.close(); busy.delete(el); void capture(el, setRibbon, blocks); } };
      card.finish(false, headline, { icon: savedTo ? '📁' : firstId ? '⬇️' : '⚠️', head: name, sub: failed.join('；') }, action, 0, pdf);
    }
  } catch (e) {
    // 插件刷新后没刷新页面：页面里还是旧脚本，和后台断了联系，发消息直接抛错（不走 .catch）
    console.error('[chatgpt-clipper] 收藏中断', e);
    setRibbon('err');
    card.finish(false, '收藏失败', { icon: '⚠️', head: title || '这条回答',
      sub: browser.runtime?.id ? (e instanceof Error ? e.message : String(e)) : '插件刚更新过，刷新这个页面后再收藏' });
  } finally {
    busy.delete(el);
    el.querySelectorAll(`[${CUT}]`).forEach(n => n.removeAttribute(CUT));
  }
}

interface ThreadAnswer { id: string; png: string; height: number; body: string; pdf: PdfAnswer }
type ThreadPart = { role: 'user'; text: string } | ({ role: 'assistant' } & (ThreadAnswer | { error: string }));
let threading = false;

/** 整段收藏（FR-13）：往下拉丝带松手后，从头到尾逐条读每一问每一答，读完滚回原位；再存成一个「日期 标题（整段）」文件夹：
 *  每条回答一张长图（answer-01.png……），一篇笔记按顺序放每一问每一答。收藏记录的键是对话地址，同一个对话再收就覆盖 */
async function captureThread() {
  if (threading) return;
  threading = true;
  const card = progressCard(), parts: ThreadPart[] = [], warns: string[] = [], started = new Date();
  let title = '';
  try {
    card.title('正在读对话…');
    card.step(0, 'on');
    const { count, missed } = await readThread(async (it, k) => {
      card.title(`正在读第 ${k} 条`);
      card.step(0, 'on', `${k} 条`);
      await nextFrame();
      if (it.role === 'user') {
        const text = userText(it.el);
        // 文件夹名用第一问的前 30 字
        title ||= text.replace(/\s+/g, ' ').trim().slice(0, 30);
        parts.push({ role: 'user', text });
        return;
      }
      try {
        parts.push({ role: 'assistant', ...(await readAnswer(it.el)) });
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        warns.push(`第 ${k} 条：${reason}`);
        parts.push({ role: 'assistant', error: reason });
        console.error(`[chatgpt-clipper] 整段收藏第 ${k} 条失败`, e);
      }
    });
    if (missed) warns.push(`漏了 ${missed} 条（滚动时没渲染出来）`);
    title ||= document.title.slice(0, 30);
    card.title('收藏中…');
    card.step(0, missed ? 'warn' : 'ok', `${count} 条`);
    // 按顺序拼成一轮一轮；长图按回答的序号起名
    const base = `${location.origin}${location.pathname}`, images: DownloadFile[] = [], rounds: ThreadRound[] = [], pdfRounds: PdfRound[] = [];
    let n = 0;
    for (const p of parts) {
      if (p.role === 'user') { rounds.push({ question: p.text, answers: [] }); pdfRounds.push({ question: p.text, answers: [] }); continue; }
      if (!rounds.length) { rounds.push({ question: '', answers: [] }); pdfRounds.push({ question: '', answers: [] }); }
      const name = `answer-${String(++n).padStart(2, '0')}.png`;
      if ('error' in p) {
        rounds.at(-1)!.answers.push({ link: base, image: '', body: '', error: p.error });
        pdfRounds.at(-1)!.answers.push({ error: p.error });
        continue;
      }
      images.push({ name, url: p.png });
      rounds.at(-1)!.answers.push({ link: `${base}${clipHash(p.id)}`, image: name, body: p.body });
      pdfRounds.at(-1)!.answers.push(p.pdf);
    }
    card.step(1, images.length < n ? 'warn' : 'ok', `${images.length} 张`);
    const note: DownloadFile = { name: noteName(`${title}（整段）`),
      url: `data:text/markdown;charset=utf-8,${encodeURIComponent(buildThreadNote({ url: base, captured: started, title, rounds, warn: warns }))}` };
    card.step(2, 'ok', `${rounds.length} 问 ${n} 答`);
    card.step(3, 'on');
    const id = `thread:${base}`, folder = `${folderName(title, started)}（整段）`;
    const pdf = pdfAction({ title: `${title}（整段）`, site: SITE_NAME, url: base, captured: started, rounds: pdfRounds, thread: true }, folder);
    const begin = (await browser.runtime.sendMessage({ type: 'thread-begin', id, folder } satisfies Request)
      .catch((e: Error) => ({ ok: false, error: e.message }))) as Response | undefined;
    if (begin?.ok) {
      const [dir = '', ...rest] = (begin.path ?? '').split('/'), sub = rest.join('/'), date = sub.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
      const head = sub.slice(date.length).trim() || title;
      if (begin.moved) {
        card.step(3, 'ok', '已收藏过');
        card.finish(true, '已收藏过', { icon: '📁', head, sub: `原文件夹已不在「${dir}」里（可能整理走了），这次没有重写` }, undefined, 8000, pdf);
        return;
      }
      for (const [i, file] of images.entries()) {
        card.step(3, 'on', `${i + 1}/${images.length}`);
        await send({ type: 'thread-file', folder: begin.folder!, job: begin.job!, file });
      }
      const end = await send({ type: 'thread-end', id, folder: begin.folder!, job: begin.job!, note, images: images.map(f => f.name) });
      const status = begin.updated ? '已更新' : '已存入', warn = warns.length > 0;
      card.step(3, 'ok', status);
      const open: Place['open'] = end.open ? { label: '在 Obsidian 里打开 ↗', href: end.open, run: () => openLink(end.open!) }
        : { label: '设置 Obsidian 位置后可直接打开 ↗', run: () => void send({ type: 'options' }) };
      card.finish(true, warn ? '已收藏，但可能不完整' : begin.updated ? '已更新整段' : '已收藏整段',
        warn ? { icon: '⚠️', head: warns.join('；'), sub: '能存的部分已存好', warn, open } : { icon: '📁', head, sub: [date, dir].filter(Boolean).join(' · '), open },
        undefined, warn ? 0 : 8000, pdf);
      return;
    }
    // 写不进 Vault：退回浏览器下载，一个文件一条消息；没选 Vault 文件夹只下载长图（同单条收藏）
    const noVault = begin?.code === 'no-folder', dl = noVault ? images : [note, ...images];
    card.step(3, 'bad', noVault ? '无 Obsidian' : begin?.code === 'no-permission' ? '授权失效' : '失败');
    let got = 0;
    for (const f of dl) got += (await send({ type: 'download', folder, files: [f] }).catch(() => ({ ids: [] }))).ids?.length ?? 0;
    const reason = noVault ? '无 Obsidian' : begin?.error ?? '后台无响应';
    card.finish(false, got ? `无法保存，${noVault ? '长图' : '文件'}已下载` : '收藏失败', { icon: got ? '⬇️' : '⚠️', head: title,
      sub: [got ? `${reason}，已下载 ${got} 个文件到 Chrome` : reason, ...warns].join('；') },
      begin?.code ? { label: noVault ? '去设置' : '去授权', run: () => void send({ type: 'options' }) } : undefined, 0, pdf);
  } catch (e) {
    console.error('[chatgpt-clipper] 整段收藏中断', e);
    card.finish(false, '整段收藏失败', { icon: '⚠️', head: title || document.title,
      sub: browser.runtime?.id ? (e instanceof Error ? e.message : String(e)) : '插件刚更新过，刷新这个页面后再收藏' });
  } finally {
    threading = false;
  }
}

/** 整段收藏里的一条回答：长图和正文，做法同单条收藏 */
async function readAnswer(el: HTMLElement): Promise<ThreadAnswer> {
  const id = await answerFingerprint(el), st = styler();
  let code: Map<Element, CodeRead>;
  try {
    code = await readCodeEditors(el, l => st.copy(l));
  } finally {
    st.dispose();
  }
  // 快照和正文紧接着做（中间不等待），后面导出图片时回答的节点可能已被页面换掉
  const snap = takeSnapshot(el, { exclude: `[${UI_ATTR}]`, drop: NOISE, codeLines: new Map([...code].map(([e, c]) => [e, c.lines])) });
  const body = answerToMarkdown(el, { exclude: `[${UI_ATTR}]`, code });
  await embedResources(snap, fetchImage);
  return { id, png: await blobToDataUrl(await toPng(snap)), height: snap.height, body, pdf: pdfAnswer(snap) };
}

/** 给回答里不含要收的块的部分打 CUT：从回答往下，含要收的块就往里走，不含就整棵打上 */
function cut(el: HTMLElement, keep: Set<HTMLElement>) {
  const walk = (e: Element) => {
    for (const c of e.children) {
      if (keep.has(c as HTMLElement)) continue;
      if ([...keep].some(k => c.contains(k))) walk(c);
      else c.setAttribute(CUT, '');
    }
  };
  walk(el);
}

/** 卡片上「导出 PDF」点了做什么：导出到「下载」，导好后「在访达中显示」打开这个文件所在位置 */
function pdfAction(doc: PdfDoc, name: string): Pdf {
  return async () => {
    const r = await exportPdf(doc, name);
    return { pages: r.pages, show: () => void send({ type: 'show', id: r.id }) };
  };
}

/** 打开 obsidian:// 链接：浏览器第一次会问要不要打开 Obsidian */
/** 单条和节选收藏的长图同时放进剪贴板（FR-14，整段收藏不放）。做图要好几秒，做完再写已不算用户点击：
 *  点击当时就交给剪贴板一个「等长图」的承诺，give 时才真正写入。done()：交出长图后等写完，写成 true，失败或 3 秒没写成 false，不影响收藏 */
function copyLater() {
  let give!: (b: Blob) => void, drop!: () => void;
  const png = new Promise<Blob>((res, rej) => { give = res; drop = () => rej(new Error('长图没做成')); });
  png.catch(() => undefined);
  const write = navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    .then(() => true, e => { console.warn('[chatgpt-clipper] 长图没能放进剪贴板', e); return false; });
  return { give, drop, done: () => Promise.race([write, new Promise<boolean>(r => setTimeout(r, 3000, false))]) };
}

function openLink(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.click();
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
