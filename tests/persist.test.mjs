// 入库和「结果怎么说」（src/lib/persist.ts）：用假的后台直接调真实的 saveThread / saveSingle / describe* / ask / send，
// 不启动浏览器、不碰真实下载和 Vault。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { ask, send } from '../src/lib/ask.ts';
import { describeSingle, describeThread, saveSingle, saveThread } from '../src/lib/persist.ts';

const NOTE = { name: 'note.md', url: 'data:text/markdown,x' };
const IMAGES = [{ name: 'answer-01.png', url: 'data:image/png;base64,QQ==' }, { name: 'answer-02.png', url: 'data:image/png;base64,QQ==' }];

/** 假后台：fail 是要失败的消息类型（前面加 hang: 就一直不回话），code 是失败时带的原因码 */
function background(fail, code, downloadsFail = false) {
  const messages = [];
  globalThis.browser = { runtime: { id: 'synthetic', async sendMessage(msg) {
    messages.push(msg);
    if (`hang:${msg.type}` === fail) return new Promise(() => {});
    if (msg.type === fail) return { ok: false, error: `注入失败：${fail}`, code };
    if (msg.type === 'thread-begin') return { ok: true, folder: '2026-11-12 整段', job: 'JOB', path: 'Vault/2026-11-12 整段' };
    if (msg.type === 'thread-end') return { ok: true, path: 'Vault/2026-11-12 整段', open: '' };
    if (msg.type === 'save') return { ok: true, path: 'Vault/2026-11-12 标题', open: 'obsidian://open?x' };
    if (msg.type === 'download') return downloadsFail ? { ok: false, error: '下载失败' } : { ok: true, ids: [messages.length] };
    return { ok: true };
  } } };
  return messages;
}

/** 整段收藏的入库和收尾：一篇笔记、两张长图 */
async function collectThread(fail, code, downloadsFail) {
  const messages = background(fail, code, downloadsFail), steps = [];
  globalThis.__limits = { save: 40 };
  try {
    const outcome = await saveThread({ ask, send }, { id: 'thread:x', folder: '2026-11-12 整段', note: NOTE, images: IMAGES }, (...v) => steps.push(v), 80);
    return { messages, steps, outcome, told: describeThread(outcome, { title: '合成问题', warns: [] }) };
  } finally {
    delete globalThis.__limits;
  }
}
const names = (messages, type) => messages.filter(m => m.type === type).map(m => m.files.map(f => f.name)).flat();

for (const stage of ['thread-file', 'thread-end']) {
  test(`${stage} 失败：取消本任务，实际下载本轮笔记和全部长图，说明失败来源`, async () => {
    const { messages, told } = await collectThread(stage);
    assert.deepEqual(names(messages, 'download'), ['note.md', 'answer-01.png', 'answer-02.png']);
    assert.equal(messages.filter(m => m.type === 'thread-cancel' && m.job === 'JOB').length, 1);
    assert.equal(told.ok, false);
    assert.match(told.headline, /已下载/);
    assert.match(told.sub, new RegExp(`注入失败：${stage}.*3 个文件`));
  });
}

for (const stage of ['thread-begin', 'thread-file', 'thread-end']) {
  test(`${stage} 后台一直不回话：到时停下，退回下载，写明没回话，不卡在「入库」`, async () => {
    const { messages, told } = await collectThread(`hang:${stage}`);
    assert.deepEqual(names(messages, 'download'), ['note.md', 'answer-01.png', 'answer-02.png']);
    assert.equal(messages.filter(m => m.type === 'thread-cancel').length, stage === 'thread-begin' ? 0 : 1);
    assert.equal(told.ok, false);
    assert.match(told.sub, /后台 0\.0[48] 秒没回话.*3 个文件/);
  });
}

test('写入失败且所有下载也失败：卡片不能声称已下载', async () => {
  const { messages, told } = await collectThread('thread-end', undefined, true);
  assert.equal(messages.filter(m => m.type === 'download').length, 3);
  assert.equal(told.headline, '收藏失败');
  assert.doesNotMatch(told.sub, /已下载/);
});

test('未选 Vault 仍只下载长图；成功仍提交而不下载、不取消', async () => {
  const none = await collectThread('thread-begin', 'no-folder');
  assert.deepEqual(names(none.messages, 'download'), ['answer-01.png', 'answer-02.png']);
  assert.deepEqual([none.told.headline, none.told.action, none.steps.at(-1)], ['无法保存，长图已下载', 'folder', ['bad', '无 Obsidian']]);
  const ok = await collectThread();
  assert.equal(ok.messages.filter(m => ['download', 'thread-cancel'].includes(m.type)).length, 0);
  assert.deepEqual(ok.told, { ok: true, headline: '已收藏整段', icon: '📁', head: '整段', sub: '2026-11-12 · Vault', open: 'setup', autoCloseMs: 8000 });
});

// 单条收藏的判定表：每种结果卡片上写什么（文案是界面的一部分，改了要过 docs/DECIDED.md）
const FILES = [{ name: '标题.md', url: 'data:text/markdown,x' }, { name: 'answer.png', url: 'data:image/png;base64,QQ==' }];
async function collectSingle({ fail, code, downloadsFail, files = FILES, warns = [], redesign = false, failed = [], reply } = {}) {
  const messages = background(fail, code, downloadsFail), steps = [];
  if (reply) globalThis.browser.runtime.sendMessage = async msg => { messages.push(msg); return reply; };
  const outcome = files.length ? await saveSingle({ ask, send }, { id: 'A', folder: '2026-11-12 标题', files }, (...v) => steps.push(v)) : undefined;
  return { messages, steps, told: describeSingle(outcome, { title: '标题', warns, redesign, failed }) };
}

test('单条收藏写进 Vault：已收藏 / 已更新 / 已收藏过，各自的卡片', async () => {
  assert.deepEqual((await collectSingle()).told,
    { ok: true, headline: '已收藏', icon: '📁', head: '标题', sub: '2026-11-12 · Vault', open: 'obsidian', href: 'obsidian://open?x', autoCloseMs: 8000 });
  const updated = await collectSingle({ reply: { ok: true, path: 'Vault/2026-11-12 标题', updated: true, open: '' } });
  assert.deepEqual([updated.told.headline, updated.told.open, updated.steps.at(-1)], ['已更新', 'setup', ['ok', '已更新']]);
  const moved = await collectSingle({ reply: { ok: true, path: 'Vault/2026-11-01 旧标题', moved: true, open: '' }, warns: ['长图里有 1 张图没取到'] });
  assert.deepEqual(moved.told, { ok: true, headline: '已收藏过', icon: '📁', head: '旧标题', sub: '原文件夹已不在「Vault」里（可能整理走了），这次没有重写', autoCloseMs: 8000 });
});

test('单条收藏标黄：改版自检没过写「页面可能改版了」，只是图没取到写「其余部分已存好」，都不自动关', async () => {
  const redesign = await collectSingle({ warns: ['长图只有页面高度的 40%'], redesign: true });
  assert.deepEqual(redesign.told, { ok: true, headline: '已收藏，但可能不完整', icon: '⚠️', head: '长图只有页面高度的 40%', sub: '页面可能改版了，能存的部分已存好',
    warn: true, open: 'obsidian', href: 'obsidian://open?x', autoCloseMs: 0 });
  assert.equal((await collectSingle({ warns: ['长图里有 1 张图没取到'] })).told.sub, '其余部分已存好');
});

test('单条收藏写不进 Vault：没选文件夹只下载长图、给「去设置」；授权失效、后台出错下载全部文件；下载也失败不说已下载', async () => {
  const none = await collectSingle({ fail: 'save', code: 'no-folder' });
  assert.deepEqual(names(none.messages, 'download'), ['answer.png']);
  assert.deepEqual(none.told, { ok: false, icon: '⬇️', head: '标题', sub: '无 Obsidian，长图已下载到 Chrome', autoCloseMs: 0, headline: '无法保存，长图已下载', action: 'folder' });
  const perm = await collectSingle({ fail: 'save', code: 'no-permission' });
  assert.deepEqual(names(perm.messages, 'download'), ['标题.md', 'answer.png']);
  assert.deepEqual([perm.told.headline, perm.told.sub, perm.told.action, perm.steps.at(-1)], ['已存到下载目录', '注入失败：save', 'permission', ['bad', '授权失效']]);
  const partial = await collectSingle({ fail: 'save', failed: ['PNG 文件：画布导出 PNG 失败'], files: [FILES[0]] });
  assert.deepEqual([partial.told.headline, partial.told.sub, partial.told.action], ['已存到下载目录（不完整）', 'PNG 文件：画布导出 PNG 失败；注入失败：save', 'retry']);
  const lost = await collectSingle({ fail: 'save', downloadsFail: true });
  assert.deepEqual([lost.told.headline, lost.told.icon, lost.told.sub], ['收藏失败', '⚠️', '注入失败：save；退回下载也失败：下载失败']);
});

test('单条收藏前三步有失败：存下的标「已收藏（不完整）」；一样都没做成是「收藏失败」，都给「重试」', async () => {
  const partial = await collectSingle({ failed: ['PNG 文件：画布导出 PNG 失败'], files: [FILES[0]] });
  assert.deepEqual(partial.told, { ok: false, headline: '已收藏（不完整）', icon: '📁', head: '标题', sub: 'PNG 文件：画布导出 PNG 失败', action: 'retry', autoCloseMs: 0 });
  const nothing = await collectSingle({ failed: ['快照：出错', 'MD 文件：出错'], files: [] });
  assert.deepEqual(nothing.told, { ok: false, headline: '收藏失败', icon: '⚠️', head: '标题', sub: '快照：出错；MD 文件：出错', action: 'retry', autoCloseMs: 0 });
  assert.equal(nothing.messages.length, 0, '没有东西可存就不发消息');
});

test('取消暂存不依赖 Vault 授权，后台实际转交指定任务', async () => {
  const source = readFileSync(new URL('../src/entrypoints/background.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function handle('), source.indexOf('/** 写 Vault 之前'));
  const cancelled = [];
  const handle = runInNewContext(stripTypeScriptTypes(`${body}\nhandle;`), {
    cancelThread: async job => cancelled.push(job),
    findDir: async () => { throw new Error('取消不应读取 Vault'); },
  });
  const response = await handle({ type: 'thread-cancel', job: 'JOB' });
  assert.equal(response.ok, true);
  assert.deepEqual(cancelled, ['JOB']);
});
