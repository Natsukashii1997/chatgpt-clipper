// 收藏文件夹起名：用内存里的假目录代替 File System Access 的目录句柄
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newFolder, obsidianUrl } from '../src/lib/vault.ts';

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

test('在 Obsidian 里打开的链接：第一段是 Vault 名，其余加上收藏文件夹和笔记名（去掉 .md），多余斜杠和空格不影响', () => {
  assert.equal(obsidianUrl(' Obsidian Vault/00 待整理/ChatGPT收藏/ ', '2026-11-04 番茄钟 (2)', '番茄钟.md'),
    'obsidian://open?vault=Obsidian%20Vault&file=' + encodeURIComponent('00 待整理/ChatGPT收藏/2026-11-04 番茄钟 (2)/番茄钟'));
});
