// 合成对话调用真实 captureThread / send / 后台 handle；不启动浏览器、不碰真实下载和 Vault。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const content = readFileSync(new URL('../src/entrypoints/content.ts', import.meta.url), 'utf8');
const capture = content.slice(content.indexOf('interface ThreadAnswer'), content.indexOf('/** 整段收藏里的一条回答'));
// ask / send / within 取真实源码，去掉 import、export 后放进同一个沙箱
const lib = ['../src/lib/timeout.ts', '../src/lib/ask.ts'].map(f => readFileSync(new URL(f, import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '')).join('\n');
const compile = code => stripTypeScriptTypes(code);

async function collect(fail, code, downloadsFail = false) {
  const messages = [], finished = [], steps = [];
  const browser = { runtime: { id: 'synthetic', async sendMessage(msg) {
    messages.push(msg);
    if (`hang:${msg.type}` === fail) return new Promise(() => {});
    if (msg.type === fail) return { ok: false, error: `注入失败：${fail}`, code };
    if (msg.type === 'thread-begin') return { ok: true, folder: '2026-11-12 整段', job: 'JOB', path: 'Vault/2026-11-12 整段' };
    if (msg.type === 'download') return downloadsFail ? { ok: false, error: '下载失败' } : { ok: true, ids: [messages.length] };
    return { ok: true };
  } } };
  const run = runInNewContext(compile(`${lib}\n${capture}\ncaptureThread;`), {
    browser, console: { error() {} }, Date, Promise, setTimeout, clearTimeout, __limits: { save: 40 },
    progressCard: () => ({ title() {}, step: (...v) => steps.push(v), finish: (...v) => finished.push(v) }),
    readThread: async visit => {
      await visit({ role: 'user', el: {} }, 1);
      await visit({ role: 'assistant', el: {} }, 2);
      await visit({ role: 'assistant', el: {} }, 3);
      return { count: 3, missed: 0 };
    },
    userText: () => '合成问题', nextFrame: async () => {},
    readAnswer: async () => ({ id: 'A', png: 'data:image/png;base64,QQ==', height: 1, body: '合成回答', pdf: {}, lost: [] }),
    location: { origin: 'https://chatgpt.com', pathname: '/c/synthetic' }, document: { title: '合成对话' },
    noteName: () => 'note.md', folderName: () => '2026-11-12 整段', clipHash: () => '#A',
    buildThreadNote: () => '合成笔记', pdfAction: () => ({}), SITE_NAME: 'ChatGPT', openLink() {},
  });
  await run();
  return { messages, finished, steps };
}

for (const stage of ['thread-file', 'thread-end']) {
  test(`${stage} 失败：取消本任务，实际下载本轮笔记和全部长图，说明失败来源`, async () => {
    const { messages, finished } = await collect(stage);
    assert.deepEqual(messages.filter(m => m.type === 'download').map(m => m.files[0].name), ['note.md', 'answer-01.png', 'answer-02.png']);
    assert.equal(messages.filter(m => m.type === 'thread-cancel' && m.job === 'JOB').length, 1);
    assert.equal(finished.at(-1)[0], false);
    assert.match(finished.at(-1)[1], /已下载/);
    assert.match(finished.at(-1)[2].sub, new RegExp(`注入失败：${stage}.*3 个文件`));
  });
}

for (const stage of ['thread-begin', 'thread-file', 'thread-end']) {
  test(`${stage} 后台一直不回话：到时停下，退回下载，写明没回话，不卡在「入库」`, async () => {
    const { messages, finished } = await collect(`hang:${stage}`);
    assert.deepEqual(messages.filter(m => m.type === 'download').map(m => m.files[0].name), ['note.md', 'answer-01.png', 'answer-02.png']);
    assert.equal(messages.filter(m => m.type === 'thread-cancel').length, stage === 'thread-begin' ? 0 : 1);
    assert.equal(finished.at(-1)[0], false);
    assert.match(finished.at(-1)[2].sub, /后台 0\.0[48] 秒没回话.*3 个文件/);
  });
}

test('写入失败且所有下载也失败：卡片不能声称已下载', async () => {
  const { messages, finished } = await collect('thread-end', undefined, true);
  assert.equal(messages.filter(m => m.type === 'download').length, 3);
  assert.equal(finished.at(-1)[1], '收藏失败');
  assert.doesNotMatch(finished.at(-1)[2].sub, /已下载/);
});

test('未选 Vault 仍只下载长图；成功仍提交而不下载、不取消', async () => {
  const none = await collect('thread-begin', 'no-folder');
  assert.deepEqual(none.messages.filter(m => m.type === 'download').map(m => m.files[0].name), ['answer-01.png', 'answer-02.png']);
  const ok = await collect();
  assert.equal(ok.messages.filter(m => ['download', 'thread-cancel'].includes(m.type)).length, 0);
  assert.equal(ok.finished.at(-1)[0], true);
  assert.equal(ok.finished.at(-1)[1], '已收藏整段');
});

test('取消暂存不依赖 Vault 授权，后台实际转交指定任务', async () => {
  const source = readFileSync(new URL('../src/entrypoints/background.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function handle('), source.indexOf('/** 写 Vault 之前'));
  const cancelled = [];
  const handle = runInNewContext(compile(`${body}\nhandle;`), {
    cancelThread: async job => cancelled.push(job),
    findDir: async () => { throw new Error('取消不应读取 Vault'); },
  });
  const response = await handle({ type: 'thread-cancel', job: 'JOB' });
  assert.equal(response.ok, true);
  assert.deepEqual(cancelled, ['JOB']);
});
