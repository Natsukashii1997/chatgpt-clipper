// 页面适配：所有选择器和页面标记只在这里。只用稳定的数据属性，不依赖带哈希后缀的类名。站点改版时只改这个文件。
// 每个站一个对象（chatgptSite、claudeSite），按域名选一次；下面的函数只认选出来的那个 site。
// 侦察记录：ChatGPT docs/recon/2026-11-02-侦察记录.md；Claude 网页版（M2）docs/recon/2026-11-03-Claude侦察记录.md。

/** 匹配不到任何元素：某站没有的那类内容 */
const NONE = ':not(*)';

/** 转 Markdown 用到的页面标记（ChatGPT 的 DIL 组件看 data-d-component，见 docs/recon/2026-11-02-回答结构-转MD.md） */
const CHATGPT_MARKS = {
  /** 读屏专用标题、ChatGPT 复制时排除的元素 */
  skip: '[data-conversation-role], [data-markdown-copy="exclude"], [data-d-component="favicon"]',
  /** 按钮一律不转，只有这些例外：生成图片包在预览按钮里（2026-11-18 侦察） */
  keepButton: '[data-testid="generated-image-preview"]',
  /** 文档块（writing block）和它自带的 Markdown 原文 */
  widget: '[data-client-defined-widget]',
  sourceAttr: 'data-markdown-copy-text',
  /** DIL 组件名：卡片网格、网格项、容器、横排 */
  component: (el: Element) => (el as HTMLElement).dataset?.dComponent ?? '',
  hasBorder: (el: Element) => (el as HTMLElement).dataset?.dHasBorder !== undefined,
  /** 文件引用、文件卡片底下的按钮（下载、查看）：可点的文字，没有 href */
  pressable: '[data-d-component="pressable"]',
  /** 链接后的来源胶囊：弹出层触发器里带网站小图标（favicon 已在 skip 里），只留站名（M1 验收 T3） */
  citation: '[data-d-component="popover-trigger"]:has([data-d-component="favicon"])',
  /** 交互公式卡片（learning_block，M1 验收 T2）：主公式、示例结果各一行；滑块、函数图、按钮不要 */
  learning: '[data-learning-block]',
  learningCaption: '[data-learning-block-caption-line]',
  learningInputs: '[data-input-selector-group]',
  /** 公式：KaTeX 里的 TeX 源码、块级公式 */
  katex: '.katex',
  katexDisplay: '.katex-display',
  tex: 'annotation[encoding="application/x-tex"]',
  /** Artifact 卡片和它的标题（只 Claude 有；只收卡片名，不收内容，用户 2026-11-03 定） */
  artifact: NONE,
  artifactTitle: NONE,
  /** 代码块语言：pre > code.language-xxx */
  codeLang: (code: Element | null) => code?.className.match(/language-([\w+#-]+)/)?.[1] ?? '',
  /** ChatGPT 自己的代码块（M1 验收 T1 实测）：块头在 exclude 里（图标 + 语言名 + 按钮）；
   *  可运行的用代码编辑器显示，带 data-language 的元素下一行一个 div；只读的是 pre > code，语言只写在块头 */
  codeBlock: '[data-markdown-copy="code-block"]',
  codeEditor: '[data-language]',
  /** 编辑器（CodeMirror）的行；它只渲染看得见附近的行，其余换成占高度的 cm-gap（M1 验收 T6 实测）。类名来自 CodeMirror 库，不带哈希 */
  codeLine: '.cm-line',
  codeBlockLang: (block: Element) => {
    const editor = block.querySelector<HTMLElement>('[data-language]');
    if (editor) return editor.dataset.language!;
    const label = [...block.querySelectorAll('[data-markdown-copy="exclude"] > div')].find(d => !d.children.length);
    return (label?.textContent ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  },
};
type Marks = typeof CHATGPT_MARKS;

/** 一个站的页面长什么样 */
interface Site {
  /** 写进笔记 frontmatter 的来源 */
  key: 'chatgpt' | 'claude';
  /** 给人看的站名 */
  name: string;
  /** 每条回答 */
  answer: string;
  /** 每条提问 */
  question: string;
  /** 界面行：回答里不属于正文、又占位置的界面。长图、笔记、指纹都不要；长图去掉后按剩下的内容重新量高 */
  noise: string;
  /** 对话页的地址。改版自检只在对话页查丝带挂没挂上 */
  chatPath: RegExp;
  /** 只在对话页认回答 */
  chatOnly: boolean;
  /** 块的选择器：节选（FR-12）按块收，取最外层的那个 */
  block: string;
  /** 整段收藏（FR-13）：一条消息在整段对话里的顺序号；i 是它在页面上现有消息里的序号 */
  order(el: HTMLElement, i: number): number;
  /** 这条回答是不是还在生成（只导 PDF 时跳过它，#28） */
  streaming(el: HTMLElement): boolean;
  /** 转 Markdown 用到的页面标记 */
  marks: Marks;
}

const CHATGPT_ANSWER = '[data-chatgpt-search-unit-key$=":assistant"]';
const chatgptSite: Site = {
  key: 'chatgpt',
  name: 'ChatGPT',
  // 回答：data-chatgpt-search-unit-key="fallback-turn-N:K:assistant"；生成图片的回答没有这个标记，整条回答是带消息编号的
  // data-response-body（普通回答里也有 data-response-body，但不带消息编号，docs/recon/2026-11-18-生成图片回答侦察记录.md）
  answer: `${CHATGPT_ANSWER}, [data-response-body][data-chatgpt-search-message-ids]:not(${CHATGPT_ANSWER} *)`,
  question: '[data-chatgpt-search-unit-key$=":user"]',
  // 生成图片上叠着的「编辑」「分享」等按钮（图片本身也包在一个按钮里，要留）
  noise: '[data-testid="generated-image-gallery"] button:not([data-testid="generated-image-preview"])',
  // /c/…（含 /g/…/c/…）
  chatPath: /\/c\/[^/]/,
  // 不限对话页：临时对话的地址里没有 /c/
  chatOnly: false,
  // DIL 渲染，外面还套着 section：段落、标题、列表、表格、代码块、文档块、卡片网格、带框卡片、公式
  block: 'p, h1, h2, h3, h4, h5, h6, ul, ol, table, pre, blockquote, hr, img, figure, .katex-display, [data-client-defined-widget], [data-d-component="grid"], [data-d-has-border], [data-learning-block]',
  // 全部轮次都在页面里，用页面顺序
  order: (_el, i) => i,
  // 生成中输入框的发送键换成停止键；只算最后一条回答（未在真实页面侦察，#28 合并后在真实 Chrome 里验）
  streaming: el => !!document.querySelector('[data-testid="stop-button"]') && findAnswers().at(-1) === el,
  marks: CHATGPT_MARKS,
};

// Claude 的思考过程（含联网搜索过程）那一行（用户 2026-11-03 定不收）、底部按钮和时间、读屏标题
const CLAUDE_NOISE = '[data-cds="TurnStatus"], :has(> [data-testid="message-actions"]), h3[data-find-omitted]';
const claudeSite: Site = {
  key: 'claude',
  name: 'Claude',
  // 整块回答（Artifact 卡片在正文 Prose 外面）
  answer: '[data-testid="assistant-message"]',
  question: '[data-testid="user-message"]',
  noise: CLAUDE_NOISE,
  // /chat/…
  chatPath: /^\/chat\/[^/]/,
  // Claude Code 的会话页（claude.ai/code/…）也用 assistant-message，不能挂丝带（2026-11-05 常浩发现）
  chatOnly: true,
  // 正文 Markdown 根下的每个子元素，加上正文外的 Artifact 卡片
  block: '[data-cds="Prose"] .standard-markdown > *, [data-cds="Card"][data-file-row-card]',
  // 对话行的 data-index：虚拟列表，只渲染屏幕附近的行，远处的会卸掉（docs/recon/2026-11-04-整段收藏侦察记录.md）
  order: (el, i) => Number(el.closest<HTMLElement>('[data-testid="transcript-row"][data-index]')?.dataset.index ?? i),
  // 生成中的回答带 data-is-streaming="true"（docs/recon/2026-11-03-Claude侦察记录.md）
  streaming: el => el.closest('[data-is-streaming]')?.getAttribute('data-is-streaming') === 'true',
  // 回答基本是标准 HTML：代码块是普通 pre > code.language-*，公式同样是 KaTeX；没有 DIL 组件、文档块、来源胶囊、代码编辑器
  marks: {
    ...CHATGPT_MARKS,
    /** 读屏标题、思考过程行、按钮行；代码块的语言名和复制按钮（语言看 code 的类） */
    skip: `${CLAUDE_NOISE}, [role="group"] > [data-find-omitted], [data-testid="code-block-copy"]`,
    widget: NONE, pressable: NONE, citation: NONE, learning: NONE, codeBlock: NONE, codeEditor: NONE, keepButton: NONE,
    /** Artifact 卡片和它的标题（只收卡片名，不收内容，用户 2026-11-03 定） */
    artifact: '[data-cds="Card"][data-file-row-card]',
    artifactTitle: '[data-testid="frame-card-open"]',
  },
};

const site = location.hostname === 'claude.ai' ? claudeSite : chatgptSite;

export const SITE = site.key, SITE_NAME = site.name, ANSWER_SELECTOR = site.answer, NOISE = site.noise, MD = site.marks;
export const inChat = () => site.chatPath.test(location.pathname);
/** 页面上的提问条数（改版自检用：有对话却认不出回答） */
export const countQuestions = () => document.querySelectorAll(site.question).length;
/** 这条回答还在生成 */
export const answerStreaming = (el: HTMLElement) => site.streaming(el);

/** 改版时交给 Claude 的修复请求（FR-9）：只有页面结构的统计——选择器命中数、对话区的 data- 属性名和次数，
 *  外加名字里带 testid、role、key、turn 的界面标记的取值（编号换成 ID、数字换成 N，回答标记改了一眼能看出）；
 *  不含对话文字、对话编号、账号信息 */
export function repairRequest(now: string, version: string): string {
  const root = document.querySelector('main') ?? document.body;
  const names = new Map<string, number>(), marks = new Set<string>();
  for (const el of root.querySelectorAll('*'))
    for (const a of el.attributes) {
      if (!a.name.startsWith('data-') || a.name.startsWith('data-clipper')) continue;
      names.set(a.name, (names.get(a.name) ?? 0) + 1);
      if (/testid|role|key|turn/.test(a.name))
        marks.add(`${a.name}="${a.value.replace(/[0-9a-f]{8,}(-[0-9a-f]{4,})*/gi, 'ID').replace(/\d+/g, 'N').slice(0, 50)}"`);
    }
  const top = [...names].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([n, c]) => `${n} ×${c}`);
  return [
    `chatgpt-clipper 认不出 ${SITE_NAME} 的回答了，请重新侦察对话页（docs/recon/），改 src/lib/adapter.ts。`,
    `- 时间：${now}（北京时间）`,
    `- 页面：${location.hostname} 对话页，插件版本 ${version}`,
    `- 回答选择器 ${ANSWER_SELECTOR}：${document.querySelectorAll(ANSWER_SELECTOR).length} 个`,
    `- 提问选择器 ${site.question}：${countQuestions()} 个`,
    '- 页面已静止 10 秒以上（不在生成、不在加载）',
    `- 对话区的 data- 属性（名字 × 次数）：${top.join('，') || '无'}`,
    `- 界面标记：${[...marks].slice(0, 40).join('，') || '无'}`,
  ].join('\n');
}

/** 回答左侧到 ChatGPT 外层裁剪容器（overflow-x: clip）的空白宽度，丝带只能画在这里面（2026-11-02 实测） */
export const ANSWER_GUTTER = 20;

export function findAnswers(root: ParentNode = document): HTMLElement[] {
  if (site.chatOnly && !inChat()) return [];
  return [...root.querySelectorAll<HTMLElement>(ANSWER_SELECTOR)];
}

/** 页面上这条回答看得见的字数（不算空白、界面行和公式的读屏副本），改版自检拿它和笔记比 */
export function answerChars(el: HTMLElement): number {
  const n = (s: string) => s.replace(/\s+/g, '').length;
  let len = n(el.innerText);
  for (const x of el.querySelectorAll<HTMLElement>(`${NOISE}, .katex-mathml`)) len -= n(x.innerText);
  return len;
}

export function answerBlocks(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(site.block)].filter(b => {
    for (let a = b.parentElement; a && a !== el; a = a.parentElement) if (a.matches(site.block)) return false;
    // ChatGPT 读屏专用的「ChatGPT 说：」标题不算
    return !b.closest(NOISE) && !b.matches('[data-conversation-role]');
  });
}

/** 选区碰到的块：块里真选中了字才算（三击选段时选区会伸到下一段开头）；没有字的块（图片、分隔线）碰到就算 */
export function selectedBlocks(el: HTMLElement, r: Range): HTMLElement[] {
  return answerBlocks(el).filter(b => {
    if (!r.intersectsNode(b)) return false;
    if (!b.textContent?.trim()) return true;
    const x = document.createRange();
    x.selectNodeContents(b);
    if (r.compareBoundaryPoints(Range.START_TO_START, x) > 0) x.setStart(r.startContainer, r.startOffset);
    if (r.compareBoundaryPoints(Range.END_TO_END, x) < 0) x.setEnd(r.endContainer, r.endOffset);
    return x.toString().trim() !== '';
  });
}

export function answerKey(el: HTMLElement): string {
  return el.dataset.chatgptSearchUnitKey ?? el.dataset.turnKey ?? el.dataset.chatgptSearchMessageIds ?? '';
}

/** 回答的标题（给收藏起名）：第一个看得见的标题，没有就返回空，由调用方改用提问（用户 2026-11-02 定，M1 验收 P12）。
 *  跳过「ChatGPT 说：」这类读屏专用的隐藏标题 */
export function answerTitle(el: HTMLElement): string {
  for (const n of el.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')) {
    const r = n.getBoundingClientRect(), text = n.innerText.replace(/\s+/g, ' ').trim();
    if (r.width > 1 && r.height > 1 && text) return text;
  }
  return '';
}

/** 回答指纹：对话地址 + 回答全文的 SHA-256，用来认出「同一条回答」。
 *  不用 data-chatgpt-search-unit-key（会整体平移，L-03）；回答重新生成、内容变了就算另一条。
 *  用 textContent 不用 innerText：不随悬停、折叠等显示状态变化。
 *  代码编辑器里的文字不算：它只渲染看得见附近的行，滚动过后渲染的行数会变（M1 验收 T6） */
export async function answerFingerprint(el: HTMLElement): Promise<string> {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(`${MD.codeBlock} ${MD.codeEditor}`).forEach(n => n.remove());
  // Claude 底部的「just now」这类时间会变
  copy.querySelectorAll(NOISE).forEach(n => n.remove());
  const text = `${location.origin}${location.pathname}\n${(copy.textContent ?? '').replace(/\s+/g, ' ').trim()}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 提问原文：回答前面最近的那条 `:user` 消息（真实页面同一轮，测试页跨轮，见 docs/recon/2026-11-02-回答结构-转MD.md） */
export function answerQuestion(el: HTMLElement): string {
  const users = [...document.querySelectorAll<HTMLElement>(site.question)]
    .filter(u => u.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const u = users.at(-1);
  return u ? userText(u) : '';
}

/** 一条提问的原文（去掉读屏标题、按钮） */
export function userText(u: HTMLElement): string {
  const copy = u.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(MD.skip).forEach(n => n.remove());
  return (copy.textContent ?? '').trim();
}

/** 整段收藏（FR-13）：页面上现有的每一问每一答。order 是在整段对话里的顺序号（各站怎么取见 site.order） */
export interface ThreadItem { role: 'user' | 'assistant'; el: HTMLElement; order: number }
export function threadItems(): ThreadItem[] {
  return [...document.querySelectorAll<HTMLElement>(`${site.question}, ${ANSWER_SELECTOR}`)].map((el, i) => ({
    role: el.matches(ANSWER_SELECTOR) ? 'assistant' : 'user', el, order: site.order(el, i),
  }));
}
