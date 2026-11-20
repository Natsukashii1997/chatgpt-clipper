// 设置页：选一次 Vault 里的目标文件夹，句柄存 IndexedDB；授权失效时在这里重新授权（后台不能弹授权窗口）。
// 浏览器不给完整路径，只能显示文件夹名。
import { findDir, loadDir, loadWhere, saveDir, saveWhere, type DirState } from '@/lib/vault';

const $ = (id: string) => document.getElementById(id)!;
const cur = $('cur'), pick = $('pick') as HTMLButtonElement, reauth = $('reauth') as HTMLButtonElement, msg = $('msg');
const where = $('where') as HTMLInputElement, whereMsg = $('whereMsg');

const MESSAGES: Record<DirState, string> = {
  none: '还没选文件夹，收藏会退回到浏览器下载目录。',
  stuck: '读不出这个文件夹的授权（浏览器一直没回应），点「选择文件夹」重新选一次。',
  granted: '已授权，收藏会直接写进这个文件夹。',
  prompt: '授权已失效（浏览器重启后常见），点「重新授权」恢复。',
  denied: '授权被拒绝，请重新选择文件夹。',
};

async function render() {
  const { dir, state } = await findDir();
  cur.textContent = dir ? dir.name : state === 'stuck' ? '读不出' : '未选择';
  cur.classList.toggle('none', !dir);
  reauth.hidden = state !== 'prompt';
  pick.classList.toggle('primary', state === 'none' || state === 'denied' || state === 'stuck');
  msg.textContent = MESSAGES[state];
  msg.classList.toggle('warn', state === 'prompt' || state === 'denied' || state === 'stuck');
}

pick.addEventListener('click', async () => {
  try {
    await saveDir(await window.showDirectoryPicker({ id: 'vault', mode: 'readwrite' }));
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') msg.textContent = `选择失败：${(e as Error).message}`;
    return;
  }
  await render();
});

reauth.addEventListener('click', async () => {
  const dir = await loadDir();
  if (dir) await dir.requestPermission({ mode: 'readwrite' });
  await render();
});

// 最后一段应是上面选的文件夹名，不一样多半是填错了
async function checkWhere(saved: boolean) {
  const dir = await loadDir(), v = where.value.trim(), last = v.split('/').filter(Boolean).at(-1);
  const off = !!(v && dir && last !== dir.name);
  whereMsg.className = off ? 'warn' : saved && v ? 'ok' : '';
  whereMsg.textContent = off ? `最后一段应该是上面选的文件夹「${dir!.name}」` : saved ? (v ? '✓ 已保存' : '已清空，点绿色横条不会打开 Obsidian') : '';
}

where.addEventListener('change', async () => {
  await saveWhere(where.value);
  await checkWhere(true);
});

void render();
void loadWhere().then(v => { where.value = v; void checkWhere(false); });
