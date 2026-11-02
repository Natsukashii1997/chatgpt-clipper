// ChatGPT 页面适配：所有选择器只在这里。只用稳定的数据属性，不依赖带哈希后缀的类名（docs/recon/2026-11-02-侦察记录.md）。
// ChatGPT 改版时只改这个文件。

/** 每条助手回答：data-chatgpt-search-unit-key="fallback-turn-N:K:assistant" */
export const ANSWER_SELECTOR = '[data-chatgpt-search-unit-key$=":assistant"]';

/** 给收藏起名：先找标题，没有就找正文第一段 */
const TITLE_SELECTORS = ['h1, h2, h3, h4, h5, h6', 'p, li'];
/** 回答左侧到 ChatGPT 外层裁剪容器（overflow-x: clip）的空白宽度，丝带只能画在这里面（2026-11-02 实测） */
export const ANSWER_GUTTER = 20;

export function findAnswers(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ANSWER_SELECTOR)];
}

export function answerKey(el: HTMLElement): string {
  return el.dataset.chatgptSearchUnitKey ?? '';
}

/** 回答的标题：第一个看得见的标题，没有就取正文第一段。跳过「ChatGPT 说：」这类读屏专用的隐藏标题 */
export function answerTitle(el: HTMLElement): string {
  for (const sel of TITLE_SELECTORS)
    for (const n of el.querySelectorAll<HTMLElement>(sel)) {
      const r = n.getBoundingClientRect(), text = n.innerText.replace(/\s+/g, ' ').trim();
      if (r.width > 1 && r.height > 1 && text) return text;
    }
  return '';
}
