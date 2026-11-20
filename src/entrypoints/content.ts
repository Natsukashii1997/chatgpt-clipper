import { answerBlocks, answerChars, answerFingerprint, countQuestions, answerKey, answerQuestion, answerTitle, findAnswers, inChat, NOISE, repairRequest, selectedBlocks, SITE_NAME, userText } from '@/lib/adapter';
import { answerToMarkdown, buildNote, buildThreadNote, readCodeEditors, type CodeRead, type ThreadRound } from '@/lib/markdown';
import { ask, send } from '@/lib/ask';
import { BUILD, PAGES, type DownloadFile } from '@/lib/messages';
import { limit } from '@/lib/timeout';
import { clipHash, jumpToClip } from '@/lib/jump';
import { beijingTime, folderName, noteName } from '@/lib/naming';
import { exportPdf, pdfAnswer, type PdfAnswer, type PdfDoc, type PdfRound } from '@/lib/pdf';
import { describeSingle, describeThread, saveSingle, saveThread, type Told } from '@/lib/persist';
import { embedResources, styler, takeSnapshot, toPng, type Missed } from '@/lib/snapshot';
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
    // 自检：页面上发一个 clipper-diag 事件，把这份脚本和后台的打包时间、后台入库各步通不通写到 <html data-clipper-diag>
    //（只有各步的状态，没有文件夹名、收藏内容和已收藏条数：网页脚本也能触发这个事件）。排查「卡在入库」用，后台 20 秒不回话也写明（L-26）
    ctx.addEventListener(document, 'clipper-diag', () => void (async () => {
      const { res } = await ask({ type: 'diag' }, 20_000);
      document.documentElement.dataset.clipperDiag = JSON.stringify({ content: BUILD, background: res?.ok ? res.diag : { error: res?.ok === false ? res.error : '后台无响应' } });
    })());
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
  const { res } = await ask({ type: 'saved', ids }, 0);
  if (res?.ok) list.forEach((r, i) => { if (r.state === 'idle' && res.saved.includes(ids[i]!)) r.set('done'); });
}

const busy = new WeakSet<HTMLElement>();
// 只收选中段落时，没选中的部分打上这个属性，长图和笔记都去掉，收完清掉
const CUT = 'data-clipper-cut';

/** 点丝带收藏一条回答。blocks：只收这几块（节选，FR-12）。节选单独算一条收藏：指纹是回答指纹加块序号，文件夹名带「（节选）」，不覆盖整条收藏。
 *  三步：produce 做出长图和笔记 → saveSingle 入库（写不进退回下载）→ describeSingle 定下怎么告诉用户（后两步在 persist.ts） */
async function capture(el: HTMLElement, setRibbon: (s: RibbonState) => void, blocks?: HTMLElement[]) {
  if (busy.has(el)) return;
  busy.add(el);
  // 要在第一个 await 之前：还在点击里，剪贴板才肯收
  const clip = copyLater();
  setRibbon('busy');
  // 回答没有标题就用提问，最多 30 字（M1 验收 P12）
  const title = (answerTitle(el) || answerQuestion(el).replace(/\s+/g, ' ').trim().slice(0, 30)).slice(0, 120);
  const card = progressCard();
  try {
    if (blocks) cut(el, new Set(blocks));
    const made = await produce(el, blocks, title, card, clip);
    const outcome = made.files.length ? await saveSingle({ ask, send }, { id: made.id, folder: made.folder, files: made.files }, (s, note) => card.step(3, s, note)) : undefined;
    if (outcome?.kind === 'fallback' && outcome.reason) console.error(`[chatgpt-clipper] ${answerKey(el)} ${STEPS[3]}失败`, outcome.reason);
    const told = describeSingle(outcome, { title, warns: made.warns, redesign: made.redesign, failed: made.failed });
    setRibbon(told.ok ? 'done' : 'err');
    finish(card, told, made.pdf, () => { card.close(); busy.delete(el); void capture(el, setRibbon, blocks); });
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

/** produce 的结果。files：做成的文件（笔记在前，然后 answer.png），可能一个都没有；failed：没做成的步骤和原因；
 *  warns：做成了但可能不完整的原因（标黄）；redesign：warns 里有改版自检没过的；pdf：快照做成了才有 */
interface Made { id: string; folder: string; files: DownloadFile[]; failed: string[]; warns: string[]; redesign: boolean; pdf?: Pdf }

/** 前三步：快照 → PNG 文件 → MD 文件，每步在进度卡上亮一格；哪一步失败记下原因、接着做下一步 */
async function produce(el: HTMLElement, blocks: HTMLElement[] | undefined, title: string, card: ReturnType<typeof progressCard>, clip: ReturnType<typeof copyLater>): Promise<Made> {
  const started = new Date(), answerId = await answerFingerprint(el);
  const all = blocks && answerBlocks(el), id = blocks ? `${answerId}~${blocks.map(b => all!.indexOf(b)).join('-')}` : answerId;
  const folder = `${folderName(title, started)}${blocks ? '（节选）' : ''}`, url = `${location.origin}${location.pathname}${clipHash(answerId)}`;
  const files: DownloadFile[] = [], failed: string[] = [], warns: string[] = [];
  // 只是图片、字体没嵌进不算改版；长图太矮、笔记字太少才算
  let redesign = false;
  // 改版自检：先量页面上的这条回答（节选量选中的块），结果明显比它少就照样存、标黄
  const parts = blocks ?? [el];
  const pageChars = parts.reduce((n, b) => n + answerChars(b), 0), pageHeight = Math.round(parts.reduce((n, b) => n + b.getBoundingClientRect().height, 0));
  // 节选时没选中的部分（打了 CUT）：长图里去掉后重新量高，笔记里跳过
  const dropFromImage = [NOISE, blocks && `[${CUT}]`].filter(Boolean).join(', '), skipInNote = [`[${UI_ATTR}]`, blocks && `[${CUT}]`].filter(Boolean).join(', ');
  const fail = (i: number, what: string, e: unknown) => {
    card.step(i, 'bad', '失败');
    failed.push(`${what}：${e instanceof Error ? e.message : String(e)}`);
    console.error(`[chatgpt-clipper] ${answerKey(el)} ${what}失败`, e);
  };

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
    snap = takeSnapshot(el, { exclude: `[${UI_ATTR}]`, drop: dropFromImage, codeLines: new Map([...code].map(([e, c]) => [e, c.lines])) });
    card.step(0, 'ok');
  } catch (e) {
    fail(0, '快照', e);
  }
  if (snap) {
    card.step(1, 'on');
    await nextFrame();
    try {
      const lost = missedText(await embedResources(snap, fetchImage));
      pdfAns = pdfAnswer(snap);
      const png = await toPng(snap);
      clip.give(png);
      files.push({ name: 'answer.png', url: await blobToDataUrl(png) });
      const short = snap.height < pageHeight / 2;
      if (short) { redesign = true; warns.push(`长图只有页面高度的 ${Math.round((snap.height / pageHeight) * 100)}%`); }
      warns.push(...lost);
      card.step(1, short || lost.length ? 'warn' : 'ok', `${snap.height}px · ${(await clip.done()) ? '已复制' : '未复制'}`);
    } catch (e) {
      fail(1, 'PNG 文件', e);
    }
  }
  clip.drop();   // 长图没做成：放弃这次复制（已交出去的不受影响）
  card.step(2, 'on');
  await nextFrame();
  try {
    const body = answerToMarkdown(el, { exclude: skipInNote, code: code ?? (await readCodeEditors(el)) });
    // 回答本身很短（不到 20 字）不比字数
    const chars = body.replace(/\s+/g, '').length, few = pageChars >= 20 && chars < pageChars / 2;
    if (few) { redesign = true; warns.push(chars ? `笔记只读到页面文字的 ${Math.round((chars / pageChars) * 100)}%` : '笔记没读到正文'); }
    const md = buildNote({ url, captured: started, title, question: answerQuestion(el), body, image: files.length > 0, warn: warns, redesign, excerpt: !!blocks });
    files.unshift({ name: noteName(title, SITE_NAME), url: `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}` });
    card.step(2, few ? 'warn' : 'ok', `${body.length} 字`);
  } catch (e) {
    fail(2, 'MD 文件', e);
  }
  // 导出 PDF（FR-15）：快照做成了就能导，和存没存进 Obsidian 无关；节选只有选中的那几块。文件名同收藏文件夹
  const pdf = pdfAns && pdfAction({ title: blocks ? `${title}（节选）` : title, site: SITE_NAME, url, captured: started,
    rounds: [{ question: answerQuestion(el), answers: [pdfAns] }] }, folder);
  return { id, folder, files, failed, warns, redesign, pdf };
}

/** 按 persist.ts 定下的 Told 给进度卡收尾：把「打开」「去设置」「重试」接上真正的动作 */
function finish(card: ReturnType<typeof progressCard>, t: Told, pdf: Pdf | undefined, retry?: () => void) {
  const options = () => void send({ type: 'options' });
  // 点绿块在 Obsidian 里打开（浏览器第一次会问要不要打开 Obsidian）；没设置位置时点了去设置页
  const open: Place['open'] = t.open === 'obsidian' ? { label: '在 Obsidian 里打开 ↗', href: t.href, run: () => openLink(t.href!) }
    : t.open === 'setup' ? { label: '设置 Obsidian 位置后可直接打开 ↗', run: options } : undefined;
  const action = t.action === 'retry' ? retry && { label: '重试', run: retry }
    : t.action ? { label: t.action === 'folder' ? '去设置' : '去授权', run: options } : undefined;
  card.finish(t.ok, t.headline, { icon: t.icon, head: t.head, sub: t.sub, warn: t.warn, open }, action, t.autoCloseMs, pdf);
}

interface ThreadAnswer { id: string; png: string; height: number; body: string; pdf: PdfAnswer; lost: string[] }
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
        const a = await readAnswer(it.el);
        if (a.lost.length) warns.push(`第 ${k} 条：${a.lost.join('、')}`);
        parts.push({ role: 'assistant', ...a });
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
    // 按顺序拼成一轮一轮（笔记和 PDF 各一份）；长图按回答的序号起名
    const base = `${location.origin}${location.pathname}`, images: DownloadFile[] = [], rounds: ThreadRound[] = [], pdfRounds: PdfRound[] = [];
    let n = 0;
    for (const p of parts) {
      if (p.role === 'user' || !rounds.length) {
        const question = p.role === 'user' ? p.text : '';
        rounds.push({ question, answers: [] });
        pdfRounds.push({ question, answers: [] });
        if (p.role === 'user') continue;
      }
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
    const id = `thread:${base}`, folder = `${folderName(title, started)}（整段）`;
    const pdf = pdfAction({ title: `${title}（整段）`, site: SITE_NAME, url: base, captured: started, rounds: pdfRounds, thread: true }, folder);
    // 最后一条消息要把全部长图写进 Vault，多等一倍
    const outcome = await saveThread({ ask, send }, { id, folder, note, images }, (s, x) => card.step(3, s, x), limit('save') * 2);
    finish(card, describeThread(outcome, { title, warns }), pdf);
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
  const lost = missedText(await embedResources(snap, fetchImage));
  return { id, png: await blobToDataUrl(await toPng(snap)), height: snap.height, body, pdf: pdfAnswer(snap), lost };
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

/** 打开 obsidian:// 链接 */
function openLink(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.click();
}

/** 长图里没嵌进去的东西，写给用户看的话（进度卡标黄、笔记标「可能不完整」） */
function missedText(m: Missed): string[] {
  return [m.images ? `长图里有 ${m.images} 张图没取到` : '', m.fonts ? `长图里有 ${m.fonts} 个字体没嵌进（换成了系统字体）` : ''].filter(Boolean);
}

/** 跨域图片交给后台取（内容脚本受页面 CORS 限制） */
async function fetchImage(url: string): Promise<string> {
  // 同样限时：后台不回话时这张图按没取到算（长图照出、标黄），不卡在「PNG 文件」一步
  const { res } = await ask({ type: 'image', url }, Math.min(limit('save'), limit('image')));
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
