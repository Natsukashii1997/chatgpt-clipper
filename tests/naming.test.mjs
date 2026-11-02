import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beijingTime, folderName } from '../src/lib/naming.ts';

test('时间按北京时间格式化，跨日也对', () => {
  assert.deepEqual(beijingTime(new Date('2026-11-02T16:30:00Z')), { date: '2026-11-03', time: '00:30' });
});

test('下载子文件夹名：去掉非法字符、截断标题、空标题不留尾空格', () => {
  const d = new Date('2026-11-02T09:30:00Z');
  assert.equal(folderName('A/B: 整体*业务?逻辑', d), '2026-11-02 1730 A B 整体 业务 逻辑');
  assert.equal(folderName('..隐藏', d), '2026-11-02 1730 隐藏');
  assert.equal(folderName('', d), '2026-11-02 1730');
  assert.equal(folderName('长'.repeat(50), d), `2026-11-02 1730 ${'长'.repeat(30)}`);
});
