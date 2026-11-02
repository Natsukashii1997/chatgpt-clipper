// 回答 DOM → Markdown 笔记（FR-4、FR-6）。对页面上活的回答节点跑：可见与否、加粗要看计算样式。
// 规则依据 docs/recon/2026-11-02-回答结构-转MD.md；页面标记只从 adapter 取。
import { MD } from './adapter';
import { beijingTime } from './naming';

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'PRE', 'BLOCKQUOTE',
  'HR', 'DL', 'DT', 'DD', 'DETAILS', 'SUMMARY']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'BUTTON', 'svg', 'SVG', 'INPUT', 'TEXTAREA', 'SELECT', 'CANVAS',
  'VIDEO', 'AUDIO', 'IFRAME']);

/** 把一条回答转成 Markdown 正文。exclude：插件自己挂在回答里的节点 */
export function answerToMarkdown(answer: HTMLElement, opts: { exclude?: string } = {}): string {
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
    if (comp === 'grid-item' || (comp === 'box' && MD.hasBorder(el))) return nonEmpty(card(el));
    if (comp === 'row') {
      const bs = blocks(el);
      return bs.every(b => !b.includes('\n')) ? nonEmpty(bs.join(' ')) : bs;
    }
    return blocks(el);
  }

  /** 卡片 → 列表项：第一块当小标题加粗，其余转成下一级列表；卡片套卡片逐层缩进 */
  function card(el: Element): string {
    let inner = el;
    // grid-item 里只包着一个带边框的 box：拆掉这一层，免得同一张卡片缩进两次
    for (let only = sole(inner); only && ['box', 'grid-item'].includes(MD.component(only)); only = sole(inner)) inner = only;
    return item('- ', blocks(inner), true);
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
    if (weight(el) >= 600 && weight(el.parentElement) < 600) return wrap(inner, '**');
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

  return blocks(answer).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 整篇笔记：frontmatter + 折叠的提问 + 长图 + 正文（PRD 第 2 节模板） */
export function buildNote(n: { url: string; captured: Date; title: string; question: string; body: string; image: boolean }): string {
  const { date, time } = beijingTime(n.captured);
  const front = ['---', 'source: chatgpt', `url: ${n.url}`, `captured: ${date} ${time}`, `title: ${JSON.stringify(n.title)}`,
    'tags: [chatgpt收藏]', '---'].join('\n');
  const quote = (n.question || '（没找到提问）').split('\n').map(l => (l.trim() ? `> ${l}` : '>')).join('\n');
  return [front, `> [!question]- 提问\n${quote}`, n.image ? '![[answer.png]]' : '', n.body].filter(Boolean).join('\n\n') + '\n';
}

/** 看不见的不转：display:none、visibility:hidden，以及 1×1 绝对定位的读屏文字。display:contents 的容器内容照常可见 */
function hidden(el: Element): boolean {
  const cs = getComputedStyle(el);
  if (cs.display === 'contents') return false;
  if (!el.checkVisibility({ visibilityProperty: true })) return true;
  const r = el.getBoundingClientRect();
  return cs.position === 'absolute' && r.width <= 1 && r.height <= 1;
}

function fence(pre: Element): string {
  const code = pre.querySelector('code');
  const body = (code ?? pre).textContent!.replace(/\n$/, '');
  const f = body.includes('```') ? '~~~~' : '```';
  return `${f}${MD.codeLang(code)}\n${body}\n${f}`;
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

function asTitle(b: string): string {
  const t = b.replace(/^#+\s+/, '');
  return t.includes('\n') || t.length > 60 || /^\*\*[^*]+\*\*$/.test(t) ? t : `**${t}**`;
}
