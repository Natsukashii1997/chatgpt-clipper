// 整段收藏（FR-13，2026-11-04 用户选定「拉长书签」）：从对话开头滚到结尾，逐条读每一问每一答，读完滚回原位。
// Claude 的对话是虚拟列表，远处的行会被卸掉：每滚一步就把刚出现的行读掉，不能先滚一遍再统一读（docs/recon/2026-11-04-整段收藏侦察记录.md）
import { threadItems, type ThreadItem } from './adapter';
import { scrollParent } from './jump';

// 没有下一条时每步滚半屏（相邻两步渲染的行有重叠，不漏行）；滚完等行渲染出来（实测 150ms 内）；一条找不到时最多再等几次
const STEP = 0.5, STEP_WAIT = 400, TRIES = 3;

/** 按顺序把每一条交给 read（k 从 1 起）。返回读了几条、漏了几条（顺序号跳过的，正常是 0） */
export async function readThread(read: (it: ThreadItem, k: number) => Promise<void>): Promise<{ count: number; missed: number }> {
  const first = threadItems()[0];
  if (!first) throw new Error('页面上没找到对话');
  const sc = scrollParent(first.el), start = sc.scrollTop;
  const top = () => (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top);
  const after = (last: number) => threadItems().filter(i => i.order > last).sort((a, b) => a.order - b.order);
  let last = -1, count = 0, missed = 0, bottom = 0, tries = 0;
  try {
    sc.scrollTop = 0;
    await wait(STEP_WAIT);
    for (;;) {
      const next = after(last)[0];
      if (next) {
        // 先滚到这一条开头、等它渲染好，再按顺序号重新找一次：页面可能重绘过，先前拿到的节点已不在页面上（量出来 0×0）
        sc.scrollTop += next.el.getBoundingClientRect().top - top();
        await wait(STEP_WAIT);
        const it = after(last).find(i => i.order === next.order && i.el.isConnected && i.el.getBoundingClientRect().height > 0);
        if (!it) {
          if (++tries >= TRIES) { missed++; last = next.order; tries = 0; }
          continue;
        }
        tries = 0;
        missed += it.order - last - 1;
        await read(it, ++count);
        last = it.order;
        continue;
      }
      // 到底后再等一轮，最后几行可能还没渲染
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) { if (++bottom >= 2) break; }
      else bottom = 0;
      sc.scrollTop += sc.clientHeight * STEP;
      await wait(STEP_WAIT);
    }
  } finally {
    sc.scrollTop = start;
  }
  return { count, missed };
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
