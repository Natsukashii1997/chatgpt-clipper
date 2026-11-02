// 收藏的命名：时间一律经这里按北京时间格式化（全局坑 G-02）。

const BEIJING = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** 北京时间：{ date: 'YYYY-MM-DD', time: 'HH:mm' } */
export function beijingTime(d: Date): { date: string; time: string } {
  const p = Object.fromEntries(BEIJING.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** 收藏的文件夹名：「2026-11-02 标题」（PRD 第 2 节）；标题最多 60 字（中文约 180 字节，远低于 255 字节上限）。同名由写入方加序号 */
export function folderName(title: string, d: Date): string {
  const safe = safeName(title).slice(0, 60).trim();
  return `${beijingTime(d).date}${safe ? ` ${safe}` : ''}`;
}

/** 笔记文件名：「标题.md」；另去掉 Obsidian 双链里有特殊含义的 # ^ [ ] */
export function noteName(title: string): string {
  return `${safeName(title).replace(/[#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim() || 'ChatGPT 回答'}.md`;
}

/** 去掉文件名里不允许的字符和开头的点 */
function safeName(title: string): string {
  return title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
}
