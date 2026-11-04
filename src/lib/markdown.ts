// 回答 DOM → Markdown 笔记（FR-4、FR-6）。对页面上活的回答节点跑：可见与否、加粗要看计算样式。
// 规则依据 docs/recon/2026-11-02-回答结构-转MD.md；页面标记只从 adapter 取。
import { MD, SITE } from './adapter';
import { beijingTime } from './naming';

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'PRE', 'BLOCKQUOTE',
  'HR', 'DL', 'DT', 'DD', 'DETAILS', 'SUMMARY']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'BUTTON', 'svg', 'SVG', 'INPUT', 'TEXTAREA', 'SELECT', 'CANVAS',
  'VIDEO', 'AUDIO', 'IFRAME']);

/** 把一条回答转成 Markdown 正文。exclude：插件自己挂在回答里的节点；code：readCodeEditors 读全的长代码 */
export function answerToMarkdown(answer: HTMLElement, opts: { exclude?: string; code?: Map<Element, CodeRead> } = {}): string {
  const skip = (el: Element) => SKIP.has(el.tagName) || el.matches(MD.skip) || (!!opts.exclude && el.matches(opts.exclude)) || hidden(el);
  const isBlock = (el: Element) => BLOCK.has(el.tagName) || el.matches(MD.katexDisplay);
  const kids = (el: Element) => [...el.children].filter(c => !skip(c));

  /** 子节点 → 块：连续的文字和行内元素合成一段 */
  function blocks(parent: Element): string[] {
    const out: string[] = [];
    let run = '';
    const flush = () => { const t = clean(run); if (t) out.push(t); run = ''; };
    for (const n of parent.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) run += text(n);
      else if (n.nodeType === Node.ELEMENT_NODE && !skip(n as Element)) {
        if (isBlock(n as Element)) { flush(); out.push(...block(n as Element)); } else run += inline(n as Element);
      }
    }
    flush();
    return out;
  }

  function block(el: Element): string[] {
    // 文档块自带 Markdown 原文，直接用；块头和按钮不要
    const src = el.matches(MD.widget) ? el.querySelector(`[${MD.sourceAttr}]`) : el.hasAttribute(MD.sourceAttr) ? el : null;
    if (src) return [src.getAttribute(MD.sourceAttr)!.trim()];
    if (el.matches(MD.codeBlock)) return [codeBlock(el, opts.code)];
    if (el.matches(MD.learning)) return learning(el);
    // Artifact 只收卡片名，内容要点开侧栏才加载（用户 2026-11-03 定）
    if (el.matches(MD.artifact)) return [`**Artifact：${clean(el.querySelector(MD.artifactTitle)?.textContent ?? '')}**（内容在原对话里）`];
    if (el.matches(MD.katexDisplay)) return [`$$\n${tex(el)}\n$$`];
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const t = clean(inlineOf(el)).replace(/\n+/g, ' ');
      return t ? [`${'#'.repeat(Number(tag[1]))} ${t}`] : [];
    }
    if (tag === 'PRE') return [fence(el)];
    if (tag === 'UL' || tag === 'OL') return nonEmpty(list(el));
    if (tag === 'TABLE') return nonEmpty(table(el as HTMLTableElement));
    if (tag === 'BLOCKQUOTE') return nonEmpty(blocks(el).join('\n\n').split('\n').map(l => (l ? `> ${l}` : '>')).join('\n'));
    if (tag === 'HR') return ['---'];
    const comp = MD.component(el);
    if (comp === 'grid') return nonEmpty(kids(el).map(card).filter(Boolean).join('\n'));
    if (comp === 'grid-item') return nonEmpty(card(el));
    if (comp === 'box' && MD.hasBorder(el)) {
      // 外框：第一个子元素就是另一个容器（没有自己的标题），里面的各块平铺，不把第一块当标题
      const first = kids(el)[0];
      return first && isContainer(first) ? blocks(el) : nonEmpty(card(el));
    }
    if (comp === 'box' && textOnly(el)) {
      // 无边框的小卡片：只有文字、第一块是一行短字（如流程图里的「步骤名 + 说明」）
      const bs = blocks(el);
      if (bs.length >= 2 && !bs[0]!.includes('\n') && bs[0]!.length <= 60) return nonEmpty(item('- ', bs, true));
      return bs;
    }
    if (comp === 'row') {
      // 整行只有可点的文字（文件卡片底下的「下载」「查看」按钮），没有链接，不进笔记（S3 实测）
      if (onlyPressable(el)) return [];
      const bs = blocks(el);
      // 左边一个小卡片、右边几个短标签（如「主文件」）：标签放括号里接在小卡片标题后面
      const [first, ...tags] = bs;
      if (first && isItem(first) && tags.length && tags.every(t => !t.includes('\n') && t.length <= 20)) {
        const [head, ...rest] = first.split('\n');
        return [[`${head}（${tags.join(' ')}）`, ...rest].join('\n')];
      }
      return bs.every(b => !b.includes('\n')) ? nonEmpty(bs.join(' ')) : bs;
    }
    return blocks(el);
  }

  /** 交互公式卡片：主公式（第一个不在示例结果、滑块里的公式）写成独立公式，示例结果每行一段 */
  function learning(el: Element): string[] {
    const main = [...el.querySelectorAll(MD.katex)].find(k => !k.closest(`${MD.learningCaption}, ${MD.learningInputs}`));
    const captions = [...el.querySelectorAll(MD.learningCaption)].map(c => clean(inlineOf(c)));
    return [...(main ? [`$$\n${tex(main)}\n$$`] : []), ...captions.filter(Boolean)];
  }

  /** 卡片 → 列表项：第一块当小标题加粗，其余转成下一级列表；卡片套卡片逐层缩进 */
  function card(el: Element): string {
    let inner = el;
    // grid-item 里只包着一个带边框的 box：拆掉这一层，免得同一张卡片缩进两次
    for (let only = sole(inner); only && ['box', 'grid-item'].includes(MD.component(only)); only = sole(inner)) inner = only;
    const bs = underSubtitles(blocks(inner));
    // 开头那块本身已是一个小卡片（图标 + 标题 + 说明，S3 文件卡片）：拆掉它的列表标记，它的标题就是这张卡片的标题
    if (bs[0] && isItem(bs[0])) bs[0] = bs[0].slice(2).split('\n').map(l => l.replace(/^ {2}/, '')).join('\n');
    return item('- ', bs, true);
  }

  /** 整块只有可点的文字：每段看得见的字都在 pressable 里 */
  function onlyPressable(el: Element): boolean {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let any = false;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent!.trim() || [...ancestors(n.parentElement!, el)].some(skip)) continue;
      if (!n.parentElement!.closest(MD.pressable)) return false;
      any = true;
    }
    return any;
  }

  function* ancestors(e: Element, stop: Element) {
    for (let x: Element | null = e; x && x !== stop; x = x.parentElement) yield x;
  }

  /** 容器：DIL 的 box / grid、列表、表格 */
  function isContainer(el: Element): boolean {
    return ['box', 'grid', 'grid-item', 'table', 'list'].includes(MD.component(el)) || ['UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE'].includes(el.tagName);
  }

  /** 只装着文字：段落、标题、只放文字和图标的横排 */
  function textOnly(el: Element): boolean {
    return kids(el).every(k => !isContainer(k) && (MD.component(k) !== 'row' || textOnly(k)));
  }

  function sole(el: Element): Element | null {
    const k = kids(el);
    return k.length === 1 && ![...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) ? k[0]! : null;
  }

  function list(el: Element): string {
    let n = Number(el.getAttribute('start') ?? 1);
    return kids(el).filter(li => li.tagName === 'LI')
      .map(li => item(el.tagName === 'OL' ? `${n++}. ` : '- ', blocks(li))).filter(Boolean).join('\n');
  }

  function table(el: HTMLTableElement): string {
    const rows = [...el.rows].filter(r => !skip(r))
      .map(r => [...r.cells].map(c => blocks(c).join('<br>').replace(/\n/g, '<br>').replace(/\|/g, '\\|')));
    if (!rows.length) return '';
    const w = Math.max(...rows.map(r => r.length));
    const line = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => r[i] ?? '').join(' | ')} |`;
    return [line(rows[0]!), line(Array(w).fill('---')), ...rows.slice(1).map(line)].join('\n');
  }

  function inline(el: Element): string {
    if (el.tagName === 'BR') return '\n';
    if (el.matches(MD.citation)) {
      const t = clean(inlineOf(el)).replace(/\n+/g, ' ');
      return t ? `（${t}）` : '';
    }
    if (el.matches(MD.katex)) return `$${tex(el)}$`;
    if (el.tagName === 'IMG') {
      const src = (el as HTMLImageElement).src, alt = el.getAttribute('alt') ?? '';
      return /^https?:/.test(src) ? `![${alt}](${src})` : alt;
    }
    if (el.tagName === 'CODE') {
      const t = el.textContent ?? '';
      return t.includes('`') ? `\`\` ${t} \`\`` : `\`${t}\``;
    }
    const inner = isBlock(el) ? ` ${blocks(el).join(' ')} ` : inlineOf(el);
    if (el.tagName === 'A' && el.getAttribute('href')) {
      const t = clean(inner);
      return t ? `[${t}](${(el as HTMLAnchorElement).href})` : '';
    }
    // 加粗按计算样式（ChatGPT 的卡片用 span 加粗）；Claude 的 strong 是可变字体的 501，按标签认
    const strong = /^(STRONG|B)$/.test(el.tagName) && weight(el) > weight(el.parentElement);
    if ((weight(el) >= 600 || strong) && weight(el.parentElement) < 600) return wrap(inner, '**');
    if (/^(EM|I)$/.test(el.tagName)) return wrap(inner, '*');
    if (/^(DEL|S)$/.test(el.tagName)) return wrap(inner, '~~');
    return inner;
  }

  function inlineOf(el: Element): string {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) s += text(n);
      else if (n.nodeType === Node.ELEMENT_NODE && !skip(n as Element)) s += inline(n as Element);
    }
    return s;
  }

  // 连续空行合并成一个，但代码块里的原样保留（M1 验收 T6）：奇数段是代码块
  return blocks(answer).join('\n\n').split(FENCE).map((p, i) => (i % 2 ? p : p.replace(/\n{3,}/g, '\n\n'))).join('').trim();
}

/** 整个代码块（围栏可能因在列表里而缩进）；split 时整块落在奇数位 */
const FENCE = /(^ *(?:```|~~~~)[^\n]*\n[\s\S]*?\n *(?:```|~~~~)$)/m;

/** 长代码读全（M1 验收 P13）：编辑器只渲染代码框里看得见附近的行，其余是占位块。有占位块的，把代码框滚到页面里、
 *  从头到尾逐段滚动，每段等编辑器补完再读，按行在编辑器里的位置去重；读完还原滚动位置（编辑器渲染了哪些行不一定还原）。
 *  没有占位块的不动页面。copyLine：每行第一次读到时顺带复制一份（长图用，M1 验收 P9），结果在 lines 里 */
export interface CodeRead { text: string; lines: HTMLElement[] }
export async function readCodeEditors(answer: Element, copyLine?: (line: Element) => HTMLElement): Promise<Map<Element, CodeRead>> {
  const out = new Map<Element, CodeRead>();
  for (const editor of answer.querySelectorAll(`${MD.codeBlock} ${MD.codeEditor}`)) {
    if (codeLines(editor).length === editor.children.length) continue;
    let box = editor.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (!box || !answer.contains(box)) continue;
    const lines = new Map<number, { text: string; copy?: HTMLElement }>(), x = scrollX, y = scrollY, top = box.scrollTop;
    const read = () => {
      const base = editor.getBoundingClientRect().top;
      for (const l of codeLines(editor)) {
        const at = Math.round(l.getBoundingClientRect().top - base);
        if (!lines.has(at)) lines.set(at, { text: l.textContent ?? '', copy: copyLine?.(l) });
      }
    };
    try {
      box.scrollIntoView({ block: 'nearest' });
      for (let at = 0; ; at += box.clientHeight) {
        box.scrollTop = at;
        // 编辑器滚动后不一定下一帧就补上新的行：等到代码框看得见的范围里没有占位块再读（最多约 1 秒）
        for (let i = 0; i < 60; i++) {
          await new Promise(r => requestAnimationFrame(r));
          const v = box.getBoundingClientRect();
          if (![...editor.children].some(c => { const r = c.getBoundingClientRect(); return !c.matches(MD.codeLine) && r.top < v.bottom && r.bottom > v.top; })) break;
        }
        read();
        if (at + box.clientHeight >= box.scrollHeight) break;
      }
    } finally {
      box.scrollTop = top;
      scrollTo(x, y);
    }
    const sorted = [...lines].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
    out.set(editor, { text: sorted.map(l => l.text).join('\n'), lines: sorted.flatMap(l => (l.copy ? [l.copy] : [])) });
  }
  return out;
}

/** 整篇笔记：frontmatter + 折叠的提问 + 长图 + 正文（PRD 第 2 节模板） */
export function buildNote(n: { url: string; captured: Date; title: string; question: string; body: string; image: boolean; warn?: string[] }): string {
  const { date, time } = beijingTime(n.captured);
  const front = ['---', `source: ${SITE}`, `url: ${n.url}`, `captured: ${date} ${time}`, `title: ${JSON.stringify(n.title)}`,
    `tags: [${SITE}收藏]`, ...(n.warn?.length ? ['incomplete: true'] : []), '---'].join('\n');
  const quote = (n.question || '（没找到提问）').split('\n').map(l => (l.trim() ? `> ${l}` : '>')).join('\n');
  // 改版自检没过：标「可能不完整」，以后在 Obsidian 里搜 incomplete 找出来重收
  const warn = n.warn?.length ? `> [!warning] 可能不完整\n> ${n.warn.join('；')}，页面可能改版了。` : '';
  return [front, warn, `> [!question]- 提问\n${quote}`, n.image ? '![[answer.png]]' : '', n.body].filter(Boolean).join('\n\n') + '\n';
}

/** 看不见的不转：display:none、visibility:hidden，以及 1×1 绝对定位的读屏文字。display:contents 的容器内容照常可见 */
function hidden(el: Element): boolean {
  const cs = getComputedStyle(el);
  if (cs.display === 'contents') return false;
  if (!el.checkVisibility({ visibilityProperty: true })) return true;
  const r = el.getBoundingClientRect();
  return cs.position === 'absolute' && r.width <= 1 && r.height <= 1;
}

function fence(pre: Element, lang?: string): string {
  const code = pre.querySelector('code');
  return fenced((code ?? pre).textContent!.replace(/\n$/, ''), lang ?? MD.codeLang(code));
}

/** ChatGPT 的代码块：代码编辑器逐行取（空行里只有 br），否则取 pre；语言看编辑器或块头 */
function codeBlock(block: Element, code?: Map<Element, CodeRead>): string {
  const lang = MD.codeBlockLang(block);
  const editor = block.querySelector(MD.codeEditor);
  if (editor) return fenced(code?.get(editor)?.text ?? codeLines(editor).map(l => l.textContent ?? '').join('\n'), lang);
  const pre = block.querySelector('pre');
  return pre ? fence(pre, lang || undefined) : '';
}

/** 编辑器的直接子元素里的代码行（不含占位块） */
const codeLines = (editor: Element) => [...editor.children].filter(c => c.matches(MD.codeLine));

function fenced(body: string, lang: string): string {
  const f = body.includes('```') ? '~~~~' : '```';
  return `${f}${lang}\n${body}\n${f}`;
}

const tex = (el: Element) => (el.querySelector(MD.tex)?.textContent ?? el.textContent ?? '').trim();
const text = (n: Node) => n.textContent!.replace(/\s+/g, ' ');
const clean = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const nonEmpty = (s: string) => (s ? [s] : []);
const weight = (el: Element | null) => (el ? Number.parseInt(getComputedStyle(el).fontWeight, 10) || 400 : 400);

/** 给行内内容加标记，空白留在标记外面：「 x 」→「 **x** 」 */
function wrap(inner: string, mark: string): string {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
}

/** 卡片里的小标题（整块只是一段加粗短字，M1 验收 P1）：后面的块收到它下面，直到下一个小标题；第一块是卡片标题，不动 */
function underSubtitles(bs: string[]): string[] {
  const out: string[] = [];
  let sub = -1;
  bs.forEach((b, i) => {
    if (i > 0 && /^\*\*[^*\n]+\*\*$/.test(b) && b.length <= 64) { sub = out.push(b) - 1; return; }
    if (sub < 0) { out.push(b); return; }
    out[sub] += `\n${/^(- |\d+\. )/.test(b) ? b : `- ${b.split('\n').join('\n  ')}`}`;
  });
  return out;
}

/** 列表项：后续各块缩进到标记之后；titled 时第一块当小标题、其余转成子列表 */
function item(marker: string, bs: string[], titled = false): string {
  if (!bs.length) return '';
  const [first, ...rest] = bs;
  const pad = ' '.repeat(marker.length);
  const ind = (s: string) => s.split('\n').join(`\n${pad}`);
  const isList = (s: string) => /^(- |\d+\. )/.test(s);
  const lines = [marker + ind(titled && rest.length ? asTitle(first!) : first!)];
  for (const b of rest) lines.push(pad + ind(titled && !isList(b) ? `- ${b.split('\n').join('\n  ')}` : b));
  return lines.join('\n');
}

/** 一个列表项（可带缩进的子行），不是并列的几项 */
function isItem(b: string): boolean {
  return /^(- |\d+\. )/.test(b) && b.split('\n').slice(1).every(l => /^ {2}/.test(l));
}

function asTitle(b: string): string {
  const t = b.replace(/^#+\s+/, '');
  return t.includes('\n') || t.length > 60 || /^\*\*[^*]+\*\*$/.test(t) ? t : `**${t}**`;
}
