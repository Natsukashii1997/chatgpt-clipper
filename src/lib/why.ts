// 笔记里的「为什么存」（2026-11-04 用户选定 A 版：存完再补一句）：frontmatter 的 why 字段 + 正文最上面一个 note 框。
// 只改笔记文本，不碰 DOM：内容脚本补写、后台再收藏时沿用旧笔记里的那句，都用这里。

const CALLOUT = '> [!note] 为什么存';

/** 读笔记 frontmatter 里的 why；在 Obsidian 里手改过、没加引号的也认 */
export function readWhy(md: string): string {
  const v = frontmatter(md)?.match(/^why:[ \t]*(.*)$/m)?.[1]?.trim() ?? '';
  if (v.startsWith('"')) try { return String(JSON.parse(v)).trim(); } catch { /* 引号不成对，按原文 */ }
  return v;
}

/** 写入或换掉笔记里的「为什么存」；why 为空就去掉 */
export function withWhy(md: string, why: string): string {
  const front = frontmatter(md);
  if (front === undefined) return md;
  why = why.replace(/\s+/g, ' ').trim();
  let lines = front.split('\n').filter(l => !/^why:/.test(l));
  if (why) {
    const at = lines.findIndex(l => /^title:/.test(l));
    lines.splice(at < 0 ? lines.length : at + 1, 0, `why: ${JSON.stringify(why)}`);
  }
  const rest = md.slice(`---\n${front}\n---\n`.length).replace(new RegExp(`^\\n${escape(CALLOUT)}\\n(>.*\\n)*`), '');
  return `---\n${lines.join('\n')}\n---\n${why ? `\n${CALLOUT}\n> ${why}\n` : ''}${rest}`;
}

function frontmatter(md: string): string | undefined {
  return md.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
