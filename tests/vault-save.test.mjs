// 只用合成文件和内存 IndexedDB / File System Access 边界，不读取真实 Vault。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveCollection, getSaved, threadFolder, finishThread } from '../src/lib/vault.ts';
import * as vault from '../src/lib/vault.ts';

function storage() {
  const values = new Map();
  const clone = v => {
    if (!v || typeof v !== 'object' || v instanceof Blob || v.getDirectoryHandle) return v;
    if (Array.isArray(v)) return v.map(clone);
    return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, clone(value)]));
  };
  const faults = [];
  let aborted = 0;
  const fault = (phase, folder, file) => {
    const i = faults.findIndex(f => f.phase === phase && (!f.folder || f.folder === folder) && (!f.file || f.file === file));
    if (i >= 0) {
      if (faults[i].after) { faults[i].after--; return; }
      faults.splice(i, 1);
      throw new Error(`注入失败：${phase} ${folder}/${file}`);
    }
  };
  globalThis.indexedDB = {
    open() {
      const open = {};
      setImmediate(() => {
        open.result = {
          close() {},
          transaction() {
            const tx = {}, changes = [], keys = [];
            let scheduled = false;
            tx.objectStore = () => ({
              get: key => request(() => clone(values.get(key))),
              getAllKeys: () => request(() => [...values.keys()]),
              put: (value, key) => { const copy = clone(value); return request(() => { keys.push(key); changes.push(() => values.set(key, copy)); return key; }); },
              delete: key => request(() => changes.push(() => values.delete(key))),
            });
            function request(run) {
              const req = {};
              setImmediate(() => {
                req.result = run();
                req.onsuccess?.();
                if (!scheduled) {
                  scheduled = true;
                  setImmediate(() => {
                    try { for (const key of keys) fault('idb-commit', '', key); }
                    catch (e) { tx.error = e; tx.onabort?.(); return; }
                    changes.forEach(run => run());
                    tx.oncomplete?.();
                  });
                }
              });
              return req;
            }
            return tx;
          },
        };
        open.onsuccess();
      });
      return open;
    },
  };
  const dirs = new Map();
  const dir = {
    async isSameEntry(other) { return other === dir; },
    async getDirectoryHandle(name, opts) {
      const exists = dirs.has(name);
      // 两个标签页可以在同一轮都查到目录不存在，之后才开始创建。
      await new Promise(resolve => setImmediate(resolve));
      if (!exists) {
        if (!opts?.create) throw new DOMException('', 'NotFoundError');
        if (!dirs.has(name)) dirs.set(name, new Map());
      }
      const files = dirs.get(name);
      return {
        async isSameEntry(other) { return other?._files === files; },
        _files: files,
        async getFileHandle(file, opts) {
          if (!files.has(file)) {
            if (!opts?.create) throw new DOMException('', 'NotFoundError');
            files.set(file, '');
          }
          return {
            kind: 'file',
            async getFile() { return new Blob([files.get(file)]); },
            async createWritable() {
              let data;
              return {
                async write(v) { fault('write', name, file); data = v; },
                async close() { fault('close', name, file); files.set(file, data); },
                async abort() { aborted++; },
              };
            },
          };
        },
        async *entries() { for (const file of files.keys()) yield [file, { kind: 'file' }]; },
        async removeEntry(file) { fault('remove', name, file); files.delete(file); },
      };
    },
    async removeEntry(name) { fault('remove-folder', name, ''); dirs.delete(name); },
  };
  const read = async name => Object.fromEntries(await Promise.all([...dirs.get(name)].map(async ([k, v]) => [k, typeof v === 'string' ? v : await v.text()])));
  return { dir, dirs, read, faults, values, aborted: () => aborted };
}

const files = text => [{ name: 'note.md', data: `${text}_MD` }, { name: 'answer.png', data: `${text}_PNG` }];

for (const rename of [true, false]) {
  for (const missing of ['PNG', 'MD']) {
    test(`已有收藏缺 ${missing}（${rename ? '改标题换目录' : '原地更新'}）：拒绝更新，旧目录和索引全部保留`, async t => {
      const s = storage(), old = '2026-11-01 旧标题';
      const folder = rename ? '2026-11-12 新标题' : old;
      const partial = missing === 'PNG' ? [{ name: 'new.md', data: 'NEW_MD' }] : [{ name: 'answer.png', data: 'NEW_PNG' }];
      await saveCollection(s.dir, 'A', old, files('OLD'));
      let error;
      try { await saveCollection(s.dir, 'A', folder, partial); }
      catch (e) { error = e; }
      const actual = Object.fromEntries(await Promise.all([...s.dirs.keys()].map(async name => [name, await s.read(name)])));
      t.diagnostic(JSON.stringify({ directories: actual, saved: await getSaved('A'), error: error?.message }));
      assert.deepEqual(actual, { [old]: { 'note.md': 'OLD_MD', 'answer.png': 'OLD_PNG' } });
      assert.deepEqual(await getSaved('A'), { folder: old, note: 'note.md' });
      assert.match(error?.message ?? '', /长图或笔记没有生成完整/);
      assert.equal(s.values.has('pending-write'), false);
      // 拒绝本次更新不应堵住队列；文件齐全后仍能正常更新。
      const retry = await saveCollection(s.dir, 'A', folder, files('RETRY'));
      assert.deepEqual(await s.read(retry.name), { 'note.md': 'RETRY_MD', 'answer.png': 'RETRY_PNG' });
    });
  }
}

for (const missing of ['PNG', 'MD']) {
  test(`新收藏缺 ${missing}：仍按原行为保存本次已有文件和索引`, async () => {
    const s = storage(), name = '2026-11-12 新收藏';
    const partial = missing === 'PNG' ? [files('NEW')[0]] : [files('NEW')[1]];
    assert.deepEqual(await saveCollection(s.dir, 'A', name, partial), { name, updated: false });
    assert.deepEqual(await s.read(name), Object.fromEntries(partial.map(f => [f.name, f.data])));
    assert.deepEqual(await getSaved('A'), { folder: name, note: missing === 'PNG' ? 'note.md' : undefined });
  });
}

test('跨标签页同时收藏同名的两条回答：目录和索引各自独立', async () => {
  const { dir, read } = storage();
  const [a, b] = await Promise.all([
    saveCollection(dir, 'A', '2026-11-12 同名', files('A')),
    saveCollection(dir, 'B', '2026-11-12 同名', files('B')),
  ]);
  assert.notEqual(a.name, b.name);
  assert.deepEqual(await read(a.name), { 'note.md': 'A_MD', 'answer.png': 'A_PNG' });
  assert.deepEqual(await read(b.name), { 'note.md': 'B_MD', 'answer.png': 'B_PNG' });
  assert.equal((await getSaved('A')).folder, a.name);
  assert.equal((await getSaved('B')).folder, b.name);
});

test('第二个文件写失败：整组旧文件与索引恢复，writable 中止，下次能重试', async () => {
  const s = storage(), name = '2026-11-12 标题';
  await saveCollection(s.dir, 'A', name, files('OLD'));
  s.faults.push({ phase: 'write', file: 'answer.png' });
  await assert.rejects(saveCollection(s.dir, 'A', name, files('NEW')), /注入失败/);
  assert.deepEqual(await s.read(name), { 'note.md': 'OLD_MD', 'answer.png': 'OLD_PNG' });
  assert.deepEqual(await getSaved('A'), { folder: name, note: 'note.md' });
  assert.equal(s.aborted(), 1);
  await saveCollection(s.dir, 'A', name, files('RETRY'));
  assert.deepEqual(await s.read(name), { 'note.md': 'RETRY_MD', 'answer.png': 'RETRY_PNG' });
});

test('整段收藏：逐张接收时旧图不变，结束时才整组更新并清理多余旧图', async () => {
  const s = storage(), name = '2026-11-12 整段';
  await saveCollection(s.dir, 'T', name, [
    { name: 'old.md', data: 'OLD_MD' },
    { name: 'answer-01.png', data: 'OLD_1' },
    { name: 'answer-02.png', data: 'OLD_2' },
    { name: '用户.txt', data: 'KEEP' },
  ]);
  const begin = await threadFolder(s.dir, 'T', name);
  const image = { name: 'answer-01.png', data: 'NEW_1' };
  await vault.writeThreadFile(s.dir, begin.job, image);
  assert.equal((await s.read(name))['answer-01.png'], 'OLD_1');
  await finishThread(s.dir, 'T', begin.name, { name: 'new.md', data: 'NEW_MD' }, [image.name], begin.job);
  assert.deepEqual(await s.read(name), { 'new.md': 'NEW_MD', 'answer-01.png': 'NEW_1', '用户.txt': 'KEEP' });
  assert.deepEqual(await getSaved('T'), { folder: name, note: 'new.md' });
});

test('关闭第二个文件失败：整组恢复，失败的 writable 被中止', async () => {
  const s = storage(), name = '2026-11-12 标题';
  await saveCollection(s.dir, 'A', name, files('OLD'));
  s.faults.push({ phase: 'close', file: 'answer.png' });
  await assert.rejects(saveCollection(s.dir, 'A', name, files('NEW')), /注入失败/);
  assert.deepEqual(await s.read(name), { 'note.md': 'OLD_MD', 'answer.png': 'OLD_PNG' });
  assert.equal(s.aborted(), 1);
});

test('文件写完后索引事务中止：不报告成功，恢复旧组与旧索引', async () => {
  const s = storage(), name = '2026-11-12 标题';
  await saveCollection(s.dir, 'A', name, files('OLD'));
  s.faults.push({ phase: 'idb-commit', file: 'saved:A' });
  await assert.rejects(saveCollection(s.dir, 'A', name, files('NEW')), /注入失败/);
  assert.deepEqual(await s.read(name), { 'note.md': 'OLD_MD', 'answer.png': 'OLD_PNG' });
  assert.deepEqual(await getSaved('A'), { folder: name, note: 'note.md' });
});

test('首次收藏写失败：不留下半组文件、不记索引，队列可继续处理下一条', async () => {
  const s = storage(), name = '2026-11-12 标题';
  s.faults.push({ phase: 'write', file: 'answer.png' });
  await assert.rejects(saveCollection(s.dir, 'A', name, files('NEW')), /注入失败/);
  assert.equal(s.dirs.has(name), false);
  assert.equal(await getSaved('A'), undefined);
  assert.equal((await saveCollection(s.dir, 'B', name, files('B'))).name, name);
});

test('恢复再次失败：日志保留，新后台模块在下一次写入前恢复旧组', async () => {
  const s = storage(), name = '2026-11-12 标题';
  await saveCollection(s.dir, 'A', name, files('OLD'));
  s.faults.push({ phase: 'write', file: 'answer.png' }, { phase: 'write', file: 'note.md', after: 1 });
  await assert.rejects(saveCollection(s.dir, 'A', name, files('NEW')), /尚未恢复/);
  assert.equal((await s.read(name))['note.md'], 'NEW_MD');
  const restarted = await import('../src/lib/vault.ts?restarted');
  await restarted.saveCollection(s.dir, 'B', '2026-11-12 别的回答', files('B'));
  assert.deepEqual(await s.read(name), { 'note.md': 'OLD_MD', 'answer.png': 'OLD_PNG' });
  assert.deepEqual(await getSaved('A'), { folder: name, note: 'note.md' });
});

test('更新改标题：失败保留旧目录；成功后沿用日期、换目录、删除旧目录', async () => {
  const s = storage(), old = '2026-11-01 旧标题', next = '2026-11-01 新标题';
  await saveCollection(s.dir, 'A', old, files('OLD'));
  s.faults.push({ phase: 'write', file: 'answer.png' });
  await assert.rejects(saveCollection(s.dir, 'A', '2026-11-12 新标题', files('NEW')), /注入失败/);
  assert.deepEqual(await s.read(old), { 'note.md': 'OLD_MD', 'answer.png': 'OLD_PNG' });
  assert.equal(s.dirs.has(next), false);
  const r = await saveCollection(s.dir, 'A', '2026-11-12 新标题', files('NEW'));
  assert.equal(r.name, next);
  assert.equal(s.dirs.has(old), false);
  assert.deepEqual(await s.read(next), { 'note.md': 'NEW_MD', 'answer.png': 'NEW_PNG' });
});

test('已提交新版本后旧目录清理失败：新组与索引仍完整，下次再清理旧目录', async () => {
  const s = storage(), old = '2026-11-01 旧标题', next = '2026-11-01 新标题';
  await saveCollection(s.dir, 'A', old, files('OLD'));
  s.faults.push({ phase: 'remove-folder', folder: old });
  await saveCollection(s.dir, 'A', '2026-11-12 新标题', files('NEW'));
  assert.deepEqual(await getSaved('A'), { folder: next, note: 'note.md' });
  assert.deepEqual(await s.read(next), { 'note.md': 'NEW_MD', 'answer.png': 'NEW_PNG' });
  assert.equal(s.dirs.has(old), true);
  await saveCollection(s.dir, 'B', '2026-11-12 其他', files('B'));
  assert.equal(s.dirs.has(old), false);
});

test('同一回答并发更新仍沿用原目录，最后是一整组版本，保留用户文件', async () => {
  const s = storage(), name = '2026-11-12 标题';
  await saveCollection(s.dir, 'A', name, [...files('OLD'), { name: '用户.txt', data: 'KEEP' }]);
  await Promise.all([saveCollection(s.dir, 'A', name, files('A')), saveCollection(s.dir, 'A', name, files('B'))]);
  assert.deepEqual(await s.read(name), { 'note.md': 'B_MD', 'answer.png': 'B_PNG', '用户.txt': 'KEEP' });
  assert.equal(s.dirs.size, 1);
});

test('已整理走的收藏只返回 moved，不创建新目录', async () => {
  const s = storage(), name = '2026-11-12 标题';
  await saveCollection(s.dir, 'A', name, files('OLD'));
  s.dirs.delete(name);
  assert.deepEqual(await saveCollection(s.dir, 'A', name, files('NEW')), { name, moved: true });
  assert.equal(s.dirs.size, 0);
});

test('新整段收藏与单条收藏并发同名：预留目录不重叠', async () => {
  const s = storage(), name = '2026-11-12 同名';
  const [t, a] = await Promise.all([threadFolder(s.dir, 'T', name), saveCollection(s.dir, 'A', name, files('A'))]);
  assert.notEqual(t.name, a.name);
  await vault.writeThreadFile(s.dir, t.job, { name: 'answer-01.png', data: 'T_PNG' });
  await finishThread(s.dir, 'T', t.name, { name: 'thread.md', data: 'T_MD' }, ['answer-01.png'], t.job);
  assert.deepEqual(await s.read(a.name), { 'note.md': 'A_MD', 'answer.png': 'A_PNG' });
  assert.deepEqual(await s.read(t.name), { 'thread.md': 'T_MD', 'answer-01.png': 'T_PNG' });
});

test('两次同一对话交错传图：暂存按任务分开，提交后是一整组', async () => {
  const s = storage(), name = '2026-11-12 整段';
  const [a, b] = await Promise.all([threadFolder(s.dir, 'T', name), threadFolder(s.dir, 'T', name)]);
  assert.equal(a.name, b.name);
  await vault.writeThreadFile(s.dir, a.job, { name: 'answer-01.png', data: 'A_1' });
  await vault.writeThreadFile(s.dir, b.job, { name: 'answer-01.png', data: 'B_1' });
  await vault.writeThreadFile(s.dir, a.job, { name: 'answer-02.png', data: 'A_2' });
  await finishThread(s.dir, 'T', a.name, { name: 'A.md', data: 'A_MD' }, ['answer-01.png', 'answer-02.png'], a.job);
  await finishThread(s.dir, 'T', b.name, { name: 'B.md', data: 'B_MD' }, ['answer-01.png'], b.job);
  assert.deepEqual(await s.read(name), { 'B.md': 'B_MD', 'answer-01.png': 'B_1' });
});

test('整段清理旧图失败：恢复笔记和全部旧图、保留用户文件', async () => {
  const s = storage(), name = '2026-11-12 整段';
  const old = [ { name: 'old.md', data: 'OLD_MD' }, { name: 'answer-01.png', data: 'OLD_1' },
    { name: 'answer-02.png', data: 'OLD_2' }, { name: '用户.txt', data: 'KEEP' } ];
  await saveCollection(s.dir, 'T', name, old);
  const b = await threadFolder(s.dir, 'T', name);
  await vault.writeThreadFile(s.dir, b.job, { name: 'answer-01.png', data: 'NEW_1' });
  s.faults.push({ phase: 'remove', file: 'answer-02.png' });
  await assert.rejects(finishThread(s.dir, 'T', name, { name: 'new.md', data: 'NEW_MD' }, ['answer-01.png'], b.job), /注入失败/);
  assert.deepEqual(await s.read(name), { 'old.md': 'OLD_MD', 'answer-01.png': 'OLD_1', 'answer-02.png': 'OLD_2', '用户.txt': 'KEEP' });
  assert.deepEqual(await getSaved('T'), { folder: name, note: 'old.md' });
});

test('整段清单缺图不能提交，旧收藏不变；已标记漏读的完整提交清单仍可保存', async () => {
  const s = storage(), name = '2026-11-12 整段';
  await saveCollection(s.dir, 'T', name, [{ name: 'old.md', data: 'OLD_MD' }, { name: 'answer-01.png', data: 'OLD_1' }]);
  const b = await threadFolder(s.dir, 'T', name);
  await assert.rejects(finishThread(s.dir, 'T', name, { name: 'new.md', data: 'NEW_MD' }, ['answer-01.png'], b.job), /没有收齐/);
  assert.deepEqual(await s.read(name), { 'old.md': 'OLD_MD', 'answer-01.png': 'OLD_1' });
  await finishThread(s.dir, 'T', name, { name: 'new.md', data: 'incomplete: true' }, [], b.job);
  assert.deepEqual(await s.read(name), { 'new.md': 'incomplete: true' });
});

test('恢复副本未持久化（如配额不足）：不开始覆盖旧文件', async () => {
  const s = storage(), name = '2026-11-12 标题';
  await saveCollection(s.dir, 'A', name, files('OLD'));
  s.faults.push({ phase: 'idb-commit', file: 'pending-write' });
  await assert.rejects(saveCollection(s.dir, 'A', name, files('NEW')), /注入失败/);
  assert.deepEqual(await s.read(name), { 'note.md': 'OLD_MD', 'answer.png': 'OLD_PNG' });
  assert.deepEqual(await getSaved('A'), { folder: name, note: 'note.md' });
});

test('整段图片暂存失败（如配额不足）：旧组不变，未收齐的清单不能提交', async () => {
  const s = storage(), name = '2026-11-12 整段';
  await saveCollection(s.dir, 'T', name, [{ name: 'old.md', data: 'OLD_MD' }, { name: 'answer-01.png', data: 'OLD_1' }]);
  const b = await threadFolder(s.dir, 'T', name);
  s.faults.push({ phase: 'idb-commit', file: `thread-job:${b.job}` });
  await assert.rejects(vault.writeThreadFile(s.dir, b.job, { name: 'answer-01.png', data: 'NEW_1' }), /注入失败/);
  await assert.rejects(finishThread(s.dir, 'T', name, { name: 'new.md', data: 'NEW_MD' }, ['answer-01.png'], b.job), /任务已失效/);
  assert.deepEqual(await s.read(name), { 'old.md': 'OLD_MD', 'answer-01.png': 'OLD_1' });
});


test('残留预留目录被另一条收藏占用后，重试必须分配新目录', async () => {
  const s = storage(), name = '2026-11-12 同名';
  await threadFolder(s.dir, 'T', name);
  await s.dir.removeEntry(name);
  await saveCollection(s.dir, 'B', name, files('B'));
  const retry = await threadFolder(s.dir, 'T', name);
  await vault.writeThreadFile(s.dir, retry.job, { name: 'answer-01.png', data: 'T_PNG' });
  await finishThread(s.dir, 'T', retry.name, { name: 'note.md', data: 'T_MD' }, ['answer-01.png'], retry.job);
  assert.deepEqual(await s.read(name), { 'note.md': 'B_MD', 'answer.png': 'B_PNG' });
  assert.notEqual((await getSaved('T')).folder, (await getSaved('B')).folder);
});

test('传图后预留目录被替换，结束提交拒绝写入另一条收藏', async () => {
  const s = storage(), name = '2026-11-12 同名';
  const b = await threadFolder(s.dir, 'T', name);
  await vault.writeThreadFile(s.dir, b.job, { name: 'answer-01.png', data: 'T_PNG' });
  await s.dir.removeEntry(name);
  await saveCollection(s.dir, 'B', name, files('B'));
  await assert.rejects(finishThread(s.dir, 'T', name, { name: 'note.md', data: 'T_MD' }, ['answer-01.png'], b.job), /文件夹.*替换/);
  assert.deepEqual(await s.read(name), { 'note.md': 'B_MD', 'answer.png': 'B_PNG' });
  assert.equal(await getSaved('T'), undefined);
});


test('第二张暂存失败后删除本任务图片；完整重试成功后没有残留', async () => {
  const s = storage(), name = '2026-11-12 整段';
  const b = await threadFolder(s.dir, 'T', name);
  await vault.writeThreadFile(s.dir, b.job, { name: 'answer-01.png', data: 'FIRST' });
  s.faults.push({ phase: 'idb-commit', file: `thread-job:${b.job}` });
  await assert.rejects(vault.writeThreadFile(s.dir, b.job, { name: 'answer-02.png', data: 'SECOND' }), /注入失败/);
  assert.equal(s.values.has(`thread-job:${b.job}`), false);
  const retry = await threadFolder(s.dir, 'T', name);
  await vault.writeThreadFile(s.dir, retry.job, { name: 'answer-01.png', data: 'RETRY' });
  await finishThread(s.dir, 'T', retry.name, { name: 'note.md', data: 'RETRY_MD' }, ['answer-01.png'], retry.job);
  assert.deepEqual([...s.values.keys()].filter(k => k.startsWith('thread-')), []);
});

test('取消只清本任务，保留同一对话的并发任务与预留；成功结束清空暂存', async () => {
  const s = storage(), name = '2026-11-12 整段';
  const a = await threadFolder(s.dir, 'T', name), b = await threadFolder(s.dir, 'T', name);
  await vault.writeThreadFile(s.dir, a.job, { name: 'answer-01.png', data: 'A' });
  await vault.writeThreadFile(s.dir, b.job, { name: 'answer-01.png', data: 'B' });
  await vault.cancelThread(a.job);
  assert.equal(s.values.has(`thread-job:${a.job}`), false);
  assert.equal(s.values.has(`thread-job:${b.job}`), true);
  assert.equal(s.values.has('thread-folder:T'), true);
  await finishThread(s.dir, 'T', name, { name: 'note.md', data: 'B_MD' }, ['answer-01.png'], b.job);
  assert.deepEqual(await s.read(name), { 'note.md': 'B_MD', 'answer-01.png': 'B' });
  assert.deepEqual([...s.values.keys()].filter(k => k.startsWith('thread-')), []);
});

test('模块重启后下次收藏回收超过24小时的暂存，近期仍活跃的并发任务受保护', async () => {
  const s = storage(), name = '2026-11-12 整段', clock = Date.now;
  let now = clock();
  Date.now = () => now;
  try {
    const stale = await threadFolder(s.dir, 'OLD', name);
    await vault.writeThreadFile(s.dir, stale.job, { name: 'answer-01.png', data: 'OLD' });
    now += 23 * 60 * 60 * 1000;
    const active = await threadFolder(s.dir, 'ACTIVE', name);
    now += 2 * 60 * 60 * 1000;
    const restarted = await import(`../src/lib/vault.ts?expiry=${now}`);
    await restarted.saveCollection(s.dir, 'NEW', '2026-11-12 新收藏', files('NEW'));
    assert.equal(s.values.has(`thread-job:${stale.job}`), false);
    assert.equal(s.values.has('thread-folder:OLD'), false);
    assert.equal(s.values.has(`thread-job:${active.job}`), true);
    await restarted.writeThreadFile(s.dir, active.job, { name: 'answer-01.png', data: 'ACTIVE' });
    await restarted.finishThread(s.dir, 'ACTIVE', active.name, { name: 'note.md', data: 'ACTIVE_MD' }, ['answer-01.png'], active.job);
    assert.deepEqual(await s.read(active.name), { 'note.md': 'ACTIVE_MD', 'answer-01.png': 'ACTIVE' });
  } finally { Date.now = clock; }
});

test('成功结束较早任务不会删除同一对话另一活跃任务的预留', async () => {
  const s = storage(), name = '2026-11-12 整段';
  const a = await threadFolder(s.dir, 'T', name), b = await threadFolder(s.dir, 'T', name);
  await finishThread(s.dir, 'T', name, { name: 'note.md', data: 'A' }, [], a.job);
  assert.equal(s.values.has(`thread-job:${a.job}`), false);
  assert.equal(s.values.has(`thread-job:${b.job}`), true);
  assert.equal(s.values.get('thread-folder:T').job, b.job);
  await finishThread(s.dir, 'T', name, { name: 'note.md', data: 'B' }, [], b.job);
  assert.deepEqual([...s.values.keys()].filter(k => k.startsWith('thread-')), []);
});

test('传图续期保护长任务；没有时间戳的旧版暂存会回收', async () => {
  const s = storage(), clock = Date.now;
  let now = clock();
  Date.now = () => now;
  try {
    const b = await threadFolder(s.dir, 'ACTIVE', '2026-11-12 整段');
    now += 23 * 60 * 60 * 1000;
    await vault.writeThreadFile(s.dir, b.job, { name: 'answer-01.png', data: 'ACTIVE' });
    s.values.set('thread-job:legacy', { dir: s.dir, id: 'LEGACY', name: 'unused', files: [{ name: 'answer-01.png', data: 'LEGACY' }] });
    now += 2 * 60 * 60 * 1000;
    await saveCollection(s.dir, 'NEW', '2026-11-12 新收藏', files('NEW'));
    assert.equal(s.values.has('thread-job:legacy'), false);
    assert.equal(s.values.has(`thread-job:${b.job}`), true);
    await finishThread(s.dir, 'ACTIVE', b.name, { name: 'note.md', data: 'ACTIVE_MD' }, ['answer-01.png'], b.job);
    assert.deepEqual(await s.read(b.name), { 'note.md': 'ACTIVE_MD', 'answer-01.png': 'ACTIVE' });
  } finally { Date.now = clock; }
});
