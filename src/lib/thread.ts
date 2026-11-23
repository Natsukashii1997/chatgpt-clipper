// 整段收藏（FR-13，2026-11-04 用户选定「拉长书签」）和只导 PDF（FR-16）：从对话开头往下，逐条读每一问每一答，读完滚回原位。
// Claude 和 ChatGPT 长对话都是虚拟列表，远处的行会被删掉：每滚一步就把刚出现的行读掉，不能先滚一遍再统一读
// （docs/recon/2026-11-04-整段收藏侦察记录.md、docs/recon/2026-11-23-ChatGPT长对话虚拟列表侦察记录.md）。
// ChatGPT 的行没有序号，只能按页面上现有的先后排：用每一条自己的标识（key）记「读过没有」，下一条是页面上紧跟在刚读那条后面的（#32）
import { STABLE_ORDER, threadItems, type ThreadItem } from './adapter';
import { scrollParent } from './dom';

// 没有下一条时每步滚半屏（相邻两步渲染的行有重叠，不漏行）；滚完等行渲染出来（实测 150ms 内）；一条找不到时最多再等几次
const STEP = 0.5, STEP_WAIT = 400, TRIES = 3;
// 回到顶部、滚回原位时分步走：ChatGPT 直接把滚动位置设到很远会被页面拉回，一次最多走两屏；到顶后停稳几次才算到顶（顶上可能还在加载更早的轮）
const JUMP = 2, SETTLE = 3, MAX_STEPS = 400;

/** 按顺序把每一条交给 read（k 从 1 起）。until：读完这一条就停（只导 PDF 时「从开头到这一条」，#28）。
 *  返回读了几条、漏了几条（漏的：等不出来的，加上 Claude 顺序号跳过的；正常是 0） */
export async function readThread(read: (it: ThreadItem, k: number) => Promise<void>, until?: ThreadItem): Promise<{ count: number; missed: number }> {
  const first = threadItems()[0];
  if (!first) throw new Error('页面上没找到对话');
  const sc = scrollParent(first.el), start = sc.scrollTop;
  const top = () => (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top);
  const seen = new Set<string>();
  let lastKey = '', lastOrder = -1, count = 0, missed = 0, bottom = 0, tries = 0;
  // 页面上现在的这几条里，下一条没读的：顺序号固定的取比刚读那条大的；不固定的取紧跟在刚读那条后面的，
  // 刚读那条已被删掉时取排在最后一条读过的后面的（都没有就是还没滚到，返回空，接着往下滚）
  const next = (): ThreadItem | undefined => {
    const items = threadItems().sort((a, b) => a.order - b.order);
    if (STABLE_ORDER) return items.find(i => i.order > lastOrder);
    if (!lastKey) return items[0];
    let p = items.findIndex(i => i.key === lastKey);
    if (p < 0) for (let i = items.length - 1; i >= 0 && p < 0; i--) if (seen.has(items[i]!.key)) p = i;
    return p < 0 ? undefined : items.slice(p + 1).find(i => !seen.has(i.key));
  };
  const done = (it: ThreadItem) => { seen.add(it.key); lastKey = it.key; lastOrder = it.order; };
  try {
    await scrollTo(sc, 0);
    for (;;) {
      const n = next();
      if (n && until && STABLE_ORDER && n.order > until.order) break;
      if (n) {
        // 先滚到这一条开头、等它渲染好，再按标识重新找一次：页面可能重绘过，先前拿到的节点已不在页面上（量出来 0×0）
        sc.scrollTop += n.el.getBoundingClientRect().top - top();
        await wait(STEP_WAIT);
        const it = threadItems().find(i => i.key === n.key && i.el.isConnected && i.el.getBoundingClientRect().height > 0);
        if (!it) {
          if (++tries >= TRIES) { missed++; done(n); tries = 0; }
          continue;
        }
        tries = 0;
        if (STABLE_ORDER) missed += Math.max(0, it.order - lastOrder - 1);
        await read(it, ++count);
        done(it);
        if (until && it.key === until.key) break;
        continue;
      }
      // 到底后再等一轮，最后几行可能还没渲染
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) { if (++bottom >= 2) break; }
      else bottom = 0;
      sc.scrollTop += sc.clientHeight * STEP;
      await wait(STEP_WAIT);
    }
  } finally {
    await scrollTo(sc, start);
  }
  return { count, missed };
}

/** 滚到 y：先直接设，被页面拉回或没到就分步走，每步最多 JUMP 屏；走不动了就停。到 y 后停稳 SETTLE 次才算到 */
async function scrollTo(sc: HTMLElement, y: number) {
  sc.scrollTop = y;
  await wait(STEP_WAIT);
  for (let i = 0, still = 0; i < MAX_STEPS && still < SETTLE; i++) {
    const at = sc.scrollTop, d = y - at;
    if (Math.abs(d) < 2) { still++; await wait(STEP_WAIT); continue; }
    still = 0;
    sc.scrollTop = at + Math.sign(d) * Math.min(Math.abs(d), sc.clientHeight * JUMP);
    await wait(STEP_WAIT);
    if (Math.abs(sc.scrollTop - at) < 2) return;
  }
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
