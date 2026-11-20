// 自检：入库要走的每一步各试一次（设置页「自检」按钮、页面上的 clipper-diag 事件）。
import type { DiagStep } from '../messages.ts';
import { Stuck, within } from '../timeout.ts';
import { loadDir, PROBE } from './dir.ts';
import { hasFolder } from './fs.ts';
import { idb, KEY, PAGE_DIAG, PENDING, SAVED, THREAD_JOB, WHERE } from './store.ts';

/** 自检（设置页「自检」、页面上的 clipper-diag 事件）：入库要走的每一步各试一次，各限时 3 秒，报通不通、用了多久。
 *  只报状态和数量，不带文件夹名、收藏内容（回给网页那边时后台再去掉已收藏条数）。最后一步只查一个不存在的子文件夹，不写任何东西 */
export type { DiagStep };
export async function diagnose(): Promise<DiagStep[]> {
  const steps: DiagStep[] = [], LIMIT = 3_000;
  const run = async <T>(step: string, work: () => Promise<T>, show: (v: T) => string): Promise<T | undefined> => {
    const t0 = performance.now();
    let out: string, v: T | undefined;
    try { out = show(v = await work()); }
    catch (e) { out = e instanceof Stuck ? `卡住：${e.message}` : `出错：${e instanceof Error ? e.message : String(e)}`; }
    steps.push({ step, ms: Math.round(performance.now() - t0), out });
    return v;
  };
  await run('读一条文字设置', () => idb<string | undefined>('readonly', s => s.get(WHERE), LIMIT), v => (v ? '有' : '空'));
  await run('列出记录', () => idb<IDBValidKey[]>('readonly', s => s.getAllKeys(), LIMIT), keys => {
    const n = (p: string) => keys.filter(k => typeof k === 'string' && k.startsWith(p)).length;
    return `共 ${keys.length} 条：已收藏 ${n(SAVED)}，没写完的收藏 ${n(PENDING)}，整段收藏任务 ${n(THREAD_JOB)}，文件夹 ${n(KEY)}`;
  });
  await run('写一条记录', () => idb('readwrite', s => s.put(Date.now(), 'diag'), LIMIT), () => '通');
  const dir = await run('取出文件夹', () => loadDir(LIMIT), v => (v ? '有' : '没选'));
  if (dir) {
    await run('查授权', () => within('查授权', LIMIT, dir.queryPermission({ mode: 'readwrite' })), v => v);
    await run('查只读授权', () => within('查只读授权', LIMIT, dir.queryPermission({ mode: 'read' })), v => v);
    await run('读文件夹', () => within('读文件夹', LIMIT, hasFolder(dir, PROBE)), () => '通');
  }
  return steps;
}

/** 设置页的自检结果留一份，后台自检时一并带出（排查时不用截图设置页） */
export const savePageDiag = (steps: DiagStep[]) => idb('readwrite', s => s.put({ at: Date.now(), steps }, PAGE_DIAG));
export const loadPageDiag = () => idb<{ at: number; steps: DiagStep[] } | undefined>('readonly', s => s.get(PAGE_DIAG));
