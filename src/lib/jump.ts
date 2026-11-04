// 从笔记跳回原回答（2026-11-04 用户选定 A 版：闪一下黄光）。笔记里的链接带「#clip-指纹前 10 位」，
// 打开对话后在页面里找这条回答；长对话只渲染屏幕附近的消息（Claude），找不到就往上翻着找，翻到顶还没有就提示。
import { answerFingerprint, findAnswers } from './adapter';
import { flashAnswer, notice } from './ui';

const PREFIX = '#clip-', LEN = 10;
const GIVE_UP = 15_000, STEP_WAIT = 400, HEADER = 80;

export const clipHash = (id: string) => `${PREFIX}${id.slice(0, LEN)}`;

export async function jumpToClip() {
  const want = location.hash.startsWith(PREFIX) ? location.hash.slice(PREFIX.length) : '';
  if (!/^[0-9a-f]{10}$/.test(want)) return;
  const t0 = performance.now(), url = location.href;
  let scroller: HTMLElement | null = null, start = 0, atTop = 0;
  while (performance.now() - t0 < GIVE_UP && location.href === url) {
    for (const el of findAnswers())
      if ((await answerFingerprint(el)).startsWith(want)) {
        // 滚到回答开头（长回答滚到中间时四边都在屏幕外，看不出是哪条），留出网站顶栏的高度
        const sc = scrollParent(el), top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
        sc.scrollTop += el.getBoundingClientRect().top - top - HEADER;
        flashAnswer(el);
        return;
      }
    const first = findAnswers()[0];
    if (first) {
      if (!scroller) { scroller = scrollParent(first); start = scroller.scrollTop; }
      if (scroller.scrollTop <= 0) { if (++atTop >= 3) break; }
      else scroller.scrollTop -= scroller.clientHeight * 0.8;
    }
    await new Promise(r => setTimeout(r, STEP_WAIT));
  }
  if (scroller) scroller.scrollTop = start;
  notice('没找到收藏的那条回答', '可能被删了或重新生成过，已打开对话。');
}

export function scrollParent(el: HTMLElement): HTMLElement {
  for (let a = el.parentElement; a; a = a.parentElement)
    if (/auto|scroll/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight) return a;
  return document.scrollingElement as HTMLElement;
}
