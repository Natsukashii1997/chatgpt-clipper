// 收藏文件夹起名：用内存里的假目录代替 File System Access 的目录句柄
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newFolder } from '../src/lib/vault.ts';

const fakeDir = (dirs, files = []) => ({
  async getDirectoryHandle(name) {
    if (dirs.includes(name)) return {};
    throw new DOMException('', files.includes(name) ? 'TypeMismatchError' : 'NotFoundError');
  },
});

test('另一条回答碰巧同名：加「 (2)」「 (3)」，不占用已有文件夹或同名文件', async () => {
  assert.equal(await newFolder(fakeDir([]), '2026-11-02 标题'), '2026-11-02 标题');
  assert.equal(await newFolder(fakeDir(['2026-11-02 标题']), '2026-11-02 标题'), '2026-11-02 标题 (2)');
  assert.equal(await newFolder(fakeDir(['2026-11-02 标题'], ['2026-11-02 标题 (2)']), '2026-11-02 标题'), '2026-11-02 标题 (3)');
});
