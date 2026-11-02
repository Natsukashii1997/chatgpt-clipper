// 设置页：选一次 Vault 里的目标文件夹，句柄存 IndexedDB；授权失效时在这里重新授权（后台不能弹授权窗口）。
// 浏览器不给完整路径，只能显示文件夹名。
import { dirState, loadDir, saveDir, type DirState } from '@/lib/vault';

const $ = (id: string) => document.getElementById(id)!;
const cur = $('cur'), pick = $('pick') as HTMLButtonElement, reauth = $('reauth') as HTMLButtonElement, msg = $('msg');

const MESSAGES: Record<DirState, string> = {
  none: '还没选文件夹，收藏会退回到浏览器下载目录。',
  granted: '已授权，收藏会直接写进这个文件夹。',
  prompt: '授权已失效（浏览器重启后常见），点「重新授权」恢复。',
  denied: '授权被拒绝，请重新选择文件夹。',
};

async function render() {
  const dir = await loadDir(), state = await dirState(dir);
  cur.textContent = dir ? dir.name : '未选择';
  cur.classList.toggle('none', !dir);
  reauth.hidden = state !== 'prompt';
  pick.classList.toggle('primary', state === 'none' || state === 'denied');
  msg.textContent = MESSAGES[state];
  msg.classList.toggle('warn', state === 'prompt' || state === 'denied');
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

void render();
