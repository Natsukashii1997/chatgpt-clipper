// 收藏的命名：时间一律经这里按北京时间格式化（全局坑 G-02）。

const BEIJING = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** 北京时间：{ date: 'YYYY-MM-DD', time: 'HH:mm' } */
export function beijingTime(d: Date): { date: string; time: string } {
  const p = Object.fromEntries(BEIJING.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** 下载子文件夹名：「2026-11-02 1730 标题」；去掉文件名里不允许的字符，标题最多 30 字 */
export function folderName(title: string, d: Date): string {
  const { date, time } = beijingTime(d);
  const safe = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 30).trim();
  return `${date} ${time.replace(':', '')}${safe ? ` ${safe}` : ''}`;
}
