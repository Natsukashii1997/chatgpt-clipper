// ChatGPT 页面适配：所有选择器只在这里。只用稳定的数据属性，不依赖带哈希后缀的类名（docs/recon/2026-11-02-侦察记录.md）。
// ChatGPT 改版时只改这个文件。

/** 每条助手回答：data-chatgpt-search-unit-key="fallback-turn-N:K:assistant" */
export const ANSWER_SELECTOR = '[data-chatgpt-search-unit-key$=":assistant"]';

/** 给收藏起名：回答里的标题；没有标题时由调用方改用提问（用户 2026-11-02 定，M1 验收 P12） */
const TITLE_SELECTORS = ['h1, h2, h3, h4, h5, h6'];
/** 回答左侧到 ChatGPT 外层裁剪容器（overflow-x: clip）的空白宽度，丝带只能画在这里面（2026-11-02 实测） */
export const ANSWER_GUTTER = 20;

export function findAnswers(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ANSWER_SELECTOR)];
}

export function answerKey(el: HTMLElement): string {
  return el.dataset.chatgptSearchUnitKey ?? '';
}

/** 回答的标题：第一个看得见的标题，没有就返回空。跳过「ChatGPT 说：」这类读屏专用的隐藏标题 */
export function answerTitle(el: HTMLElement): string {
  for (const sel of TITLE_SELECTORS)
    for (const n of el.querySelectorAll<HTMLElement>(sel)) {
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
  const text = `${location.origin}${location.pathname}\n${(copy.textContent ?? '').replace(/\s+/g, ' ').trim()}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 提问原文：回答前面最近的那条 `:user` 消息（真实页面同一轮，测试页跨轮，见 docs/recon/2026-11-02-回答结构-转MD.md） */
export function answerQuestion(el: HTMLElement): string {
  const users = [...document.querySelectorAll<HTMLElement>('[data-chatgpt-search-unit-key$=":user"]')]
    .filter(u => u.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const u = users.at(-1);
  if (!u) return '';
  const copy = u.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(MD.skip).forEach(n => n.remove());
  return (copy.textContent ?? '').trim();
}

/** 转 Markdown 用到的页面标记（DIL 组件看 data-d-component，见 docs/recon/2026-11-02-回答结构-转MD.md） */
export const MD = {
  /** 读屏专用标题、ChatGPT 复制时排除的元素 */
  skip: '[data-conversation-role], [data-markdown-copy="exclude"], [data-d-component="favicon"]',
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
