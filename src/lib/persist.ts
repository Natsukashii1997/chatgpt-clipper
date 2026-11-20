// 收藏的后两步：入库（写不进就退回下载），和「结果怎么告诉用户」。
// 入库返回一个几选一的结果 Outcome；describe* 把结果变成进度卡收尾要显示的内容 Told（一张判定表，纯数据）。
// 单条 / 节选（saveSingle + describeSingle）和整段（saveThread + describeThread）各一对，文案不同、形状相同。
// 这个文件不碰页面和浏览器接口：发消息的函数由调用方传进来，所以能在 node 里直接测（tests/persist.test.mjs）。
import type { DownloadFile, FailCode, Kind, Ok, Reply, Req } from './messages.ts';

/** 入库的结果 */
export type Outcome =
  /** 写进了 Vault。path「Vault 文件夹名/收藏文件夹名」；updated 覆盖了原来的收藏；
   *  open：在 Obsidian 里打开笔记的链接，空串是用户还没填 Obsidian 位置，undefined 是这次没有笔记可打开 */
  | { kind: 'saved'; path: string; updated: boolean; open?: string }
  /** 收藏过，但原文件夹已不在 Vault 文件夹里（被整理走了）：没有重写 */
  | { kind: 'moved'; path: string }
  /** 没写进 Vault，退回下载。code 是去设置页能解决的原因；reason 写给用户看的原因（单条收藏没选文件夹时不另写）；
   *  downloaded 下载成了几个文件；onlyImages 只下载了长图（没选 Vault 文件夹时）；downloadError 连下载也没成的原因 */
  | { kind: 'fallback'; code?: FailCode; reason?: string; downloaded: number; onlyImages: boolean; downloadError?: string };

/** 进度卡收尾显示什么。ok 决定卡片和丝带是绿是红；icon / head / sub 是底部「存到哪里」那一块，warn 时标黄；
 *  open：整块可点——obsidian 用 href 打开笔记，setup 去设置页填 Obsidian 位置；
 *  action：右侧按钮——retry 重试，folder 去设置（选文件夹），permission 去授权；autoCloseMs 为 0 不自动关 */
export interface Told {
  ok: boolean;
  headline: string;
  icon: string;
  head: string;
  sub: string;
  warn?: boolean;
  open?: 'obsidian' | 'setup';
  href?: string;
  action?: 'retry' | 'folder' | 'permission';
  autoCloseMs: number;
}

/** 给后台发消息的两个函数（ask.ts 的 ask、send） */
export interface Bg {
  ask<K extends Kind>(msg: Req<K>, ms?: number): Promise<{ res: Reply<K> | undefined; late: boolean }>;
  send<K extends Kind>(msg: Req<K>, ms?: number): Promise<Ok<K>>;
}
/** 更新进度卡「入库」那一步 */
type Step = (state: 'on' | 'ok' | 'bad', note?: string) => void;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** 「入库」一步失败时的短标签 */
const failLabel = (code: FailCode | undefined, late = false) => (code === 'no-folder' ? '无 Obsidian' : code === 'no-permission' ? '授权失效' : late ? '超时' : '失败');

/** 单条收藏、节选入库。files：笔记在前（有的话），然后是 answer.png。
 *  写不进 Vault 就退回浏览器下载（FR-5）；没选 Vault 文件夹（比如没装 Obsidian）只下载长图（2026-11-03 用户决定） */
export async function saveSingle(bg: Bg, job: { id: string; folder: string; files: DownloadFile[] }, step: Step): Promise<Outcome> {
  step('on');
  const { res, late } = await bg.ask({ type: 'save', ...job });
  if (res?.ok) {
    step('ok', res.moved ? '已收藏过' : res.updated ? '已更新' : '已存入');
    if (res.moved) return { kind: 'moved', path: res.path };
    return { kind: 'saved', path: res.path, updated: !!res.updated, open: job.files[0]?.name.endsWith('.md') ? res.open : undefined };
  }
  const code = res?.code, noVault = code === 'no-folder';
  const png = job.files.filter(f => f.name === 'answer.png'), onlyImages = noVault && png.length > 0;
  step('bad', failLabel(code, late));
  let downloaded = 0, downloadError: string | undefined;
  try {
    const dl = onlyImages ? png : job.files;
    if ((await bg.send({ type: 'download', folder: job.folder, files: dl })).ids[0]) downloaded = dl.length;
  } catch (e) {
    downloadError = message(e);
  }
  return { kind: 'fallback', code, downloaded, onlyImages, downloadError,
    reason: noVault ? undefined : res?.error ? `${res.error}${late ? '，没存进 Vault' : ''}` : '后台无响应' };
}

/** 整段收藏入库：定文件夹 → 长图一张一条消息送去暂存 → 最后送笔记、整组写入（endMs：这最后一条等多久）。
 *  中途失败就取消暂存，和开头就失败一样退回下载（一个文件一条消息）；没选 Vault 文件夹只下载长图 */
export async function saveThread(bg: Bg, job: { id: string; folder: string; note: DownloadFile; images: DownloadFile[] }, step: Step, endMs?: number): Promise<Outcome> {
  const { id, folder, note, images } = job;
  step('on');
  const { res: begin } = await bg.ask({ type: 'thread-begin', id, folder });
  let failure: { error?: string; code?: FailCode } | undefined = begin?.ok ? undefined : begin;
  if (begin?.ok) {
    if (begin.moved) {
      step('ok', '已收藏过');
      return { kind: 'moved', path: begin.path };
    }
    try {
      for (const [i, file] of images.entries()) {
        step('on', `${i + 1}/${images.length}`);
        await bg.send({ type: 'thread-file', folder: begin.folder, job: begin.job!, file });
      }
      const end = await bg.send({ type: 'thread-end', id, folder: begin.folder, job: begin.job!, note, images: images.map(f => f.name) }, endMs);
      step('ok', begin.updated ? '已更新' : '已存入');
      return { kind: 'saved', path: begin.path, updated: !!begin.updated, open: end.open };
    } catch (e) {
      // 取消不依赖 Vault 授权；若后台已不可用，后续收藏会回收过期暂存
      await bg.send({ type: 'thread-cancel', job: begin.job! }).catch(() => undefined);
      failure = { error: message(e) };
    }
  }
  const code = failure?.code, noVault = code === 'no-folder';
  step('bad', failLabel(code));
  let downloaded = 0;
  for (const f of noVault ? images : [note, ...images])
    downloaded += (await bg.send({ type: 'download', folder, files: [f] }).catch(() => ({ ids: [] as number[] }))).ids.length;
  return { kind: 'fallback', code, downloaded, onlyImages: noVault, reason: noVault ? '无 Obsidian' : failure?.error ?? '后台无响应' };
}

/** path「Vault 文件夹名/日期 标题」拆开：dir 是 Vault 文件夹名，date 是日期，name 是标题（没有就用 fallback） */
function place(path: string, fallback: string): { dir: string; date: string; name: string } {
  const [dir = '', ...rest] = path.split('/'), sub = rest.join('/'), date = sub.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  return { dir, date, name: sub.slice(date.length).trim() || fallback };
}

const movedTold = (path: string, fallback: string): Told => {
  const { dir, name } = place(path, fallback);
  return { ok: true, headline: '已收藏过', icon: '📁', head: name, sub: `原文件夹已不在「${dir}」里（可能整理走了），这次没有重写`, autoCloseMs: 8000 };
};

/** 写进去了：底部第一行回答标题，第二行「日期 · Vault 文件夹」（用户 2026-11-02 要求日期单独一行、标题不重复）；
 *  有 warns 就标黄、把 warns 写在第一行、第二行写 warnSub，卡片不自动关 */
function savedTold(o: Outcome & { kind: 'saved' }, fallback: string, headline: string, warns: string[], warnSub: string): Told {
  const { dir, date, name } = place(o.path, fallback), warn = warns.length > 0;
  const open = o.open === undefined ? {} : o.open ? { open: 'obsidian' as const, href: o.open } : { open: 'setup' as const };
  return warn ? { ok: true, headline: '已收藏，但可能不完整', icon: '⚠️', head: warns.join('；'), sub: warnSub, warn, ...open, autoCloseMs: 0 }
    : { ok: true, headline, icon: '📁', head: name, sub: [date, dir].filter(Boolean).join(' · '), ...open, autoCloseMs: 8000 };
}

/** 单条收藏、节选怎么收尾。o 为 undefined：快照、长图、笔记一样都没做成，没有东西可存。
 *  failed：前三步（快照、PNG、MD）失败的原因；warns：标黄的原因；redesign：warns 里有改版自检没过的 */
export function describeSingle(o: Outcome | undefined, c: { title: string; warns: string[]; redesign: boolean; failed: string[] }): Told {
  const fallback = c.title || '这条回答', failed = [...c.failed], partial = failed.length > 0;
  if (o?.kind === 'fallback') {
    const what = o.onlyImages ? '长图' : '文件';
    if (o.reason) failed.push(o.reason);
    if (o.downloadError !== undefined) failed.push(`退回下载也失败：${o.downloadError}`);
    if (o.code === 'no-folder') failed.unshift(o.downloadError === undefined ? `无 Obsidian，${what}已下载到 Chrome` : '无 Obsidian，无法保存');
    return {
      ok: false, icon: o.downloaded ? '⬇️' : '⚠️', head: fallback, sub: failed.join('；'), autoCloseMs: 0,
      headline: !o.downloaded ? '收藏失败' : o.code === 'no-folder' ? `无法保存，${what}已下载` : `已存到下载目录${partial ? '（不完整）' : ''}`,
      action: o.code === 'no-folder' ? 'folder' : o.code ? 'permission' : 'retry',
    };
  }
  // 前三步有失败：存下来的不完整（o 是 saved / moved），或什么都没存下（o 为 undefined）
  if (partial) return { ok: false, headline: o ? '已收藏（不完整）' : '收藏失败', icon: o ? '📁' : '⚠️', head: place(o?.path ?? '', fallback).name, sub: failed.join('；'), action: 'retry', autoCloseMs: 0 };
  if (!o) throw new Error('没有东西可存，却没有失败原因');
  if (o.kind === 'moved') return movedTold(o.path, fallback);
  return savedTold(o, fallback, o.updated ? '已更新' : '已收藏', c.warns, c.redesign ? '页面可能改版了，能存的部分已存好' : '其余部分已存好');
}

/** 整段收藏怎么收尾。warns：没读成的回答、漏读的条数等 */
export function describeThread(o: Outcome, c: { title: string; warns: string[] }): Told {
  if (o.kind === 'moved') return movedTold(o.path, c.title);
  if (o.kind === 'saved') return savedTold(o, c.title, o.updated ? '已更新整段' : '已收藏整段', c.warns, '能存的部分已存好');
  const reason = o.reason ?? '后台无响应';
  return {
    ok: false, icon: o.downloaded ? '⬇️' : '⚠️', head: c.title, autoCloseMs: 0,
    headline: o.downloaded ? `无法保存，${o.onlyImages ? '长图' : '文件'}已下载` : '收藏失败',
    sub: [o.downloaded ? `${reason}，已下载 ${o.downloaded} 个文件到 Chrome` : reason, ...c.warns].join('；'),
    action: o.code === 'no-folder' ? 'folder' : o.code ? 'permission' : undefined,
  };
}
