import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkRules } from '../scripts/check-rules.mjs';

test('仓库符合通用规则（scripts/check-rules.mjs）', () => {
  assert.deepEqual(checkRules(process.cwd()), []);
});

test('通用规则能抓到违规样本，合规样本不误报', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-rules-'));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  try {
    write('src/a.js', 'show(item.createdAt.slice(0, 16));\nshow(beijingTime(item.createdAt));\nshow(item.updatedAt.slice(11, 16)); // 北京时间\n');
    write('server/index.mjs', "server.listen(port);\nserver.listen(port, '127.0.0.1');\n");
    write('package.json', JSON.stringify({ dependencies: { 'left-pad': '1.0.0' } }, null, 2));
    assert.deepEqual(checkRules(root).map(v => `${v.file}:${v.line} ${v.kind}`), ['src/a.js:1 time', 'server/index.mjs:1 listen', 'package.json:3 deps']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('LESSONS 每条要有以层级词开头的「升级」行：缺行、不带层级词都报错，合规条目和格式样例不误报', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-rules-'));
  // L-01、L-02、L-04 摘自本项目 2026-11-19 补层级之前的 docs/LESSONS.md（真实样本）；L-02 标题里反引号中的
  // `<all_urls>` 曾被骨架当成格式样例的 <占位> 整条跳过。本项目没出现过整条缺「升级」行的，L-30 是构造样本
  const lessons = [
    '# 开发实录与坑', '', '## 怎么升级', '', '- 格式样例：', '', '```markdown', '## L-01 <一句话现象>（<YYYY-MM-DD>）', '', '- 升级：未升级。', '```', '', '---', '',
    '## L-01 计算样式内联后边框变成粗黑框（2026-11-02）', '', '- 现象：略。', '- 升级：未升级。', '',
    '## L-02 声明了 `<all_urls>` 仍无法调用 `captureVisibleTab`（2026-11-02）', '', '- 现象：略。', '- 升级：未升级。', '',
    '## L-04 回答内容晚于回答节点出现，挂丝带时读到的文字不全（2026-11-02）', '', '- 现象：略。', '- 升级：已写成测试（同上）。', '',
    '## L-30 构造样本：整条没写升级行（2026-11-19）', '', '- 现象：略。', '- 正确做法：略。', '',
    '## L-31 合规：未升级的也带层级词（2026-11-19）', '', '- 现象：略。', '- 升级：〔提醒〕未升级。', '',
    '## L-32 合规：已写测试但没接进必经检查（2026-11-19）', '', '- 现象：略。', '- 升级：〔提醒〕部分升级（2026-11-19 补层级）：已写测试 `tests/x.test.mjs`。', '',
  ].join('\n');
  try {
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs/LESSONS.md'), lessons);
    assert.deepEqual(checkRules(root).map(v => `${v.file}:${v.line} ${v.kind} ${v.text}`), [
      'docs/LESSONS.md:18 lessons L-01 的「升级」没以层级词开头：- 升级：未升级。',
      'docs/LESSONS.md:23 lessons L-02 的「升级」没以层级词开头：- 升级：未升级。',
      'docs/LESSONS.md:28 lessons L-04 的「升级」没以层级词开头：- 升级：已写成测试（同上）。',
      'docs/LESSONS.md:30 lessons L-30 缺「- 升级：」一行',
    ]);
    assert.match(checkRules(root)[0].rule, /〔提醒〕未升级/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
