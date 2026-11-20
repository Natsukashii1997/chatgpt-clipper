// 设置页：选一次 Vault 里的目标文件夹，句柄存 IndexedDB；授权失效时在这里重新授权（后台不能弹授权窗口）。
// 浏览器不给完整路径，只能显示文件夹名。
import { BUILD, type Request, type Response } from '@/lib/messages';
import { beijingTime } from '@/lib/naming';
import { diagnose, findDir, loadDir, loadWhere, saveDir, savePageDiag, saveWhere, type DiagStep, type DirState } from '@/lib/vault';

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
    if ((e as DOMException).name !== 'AbortError') { msg.textContent = `选择失败：${(e as Error).message}`; msg.classList.add('warn'); }
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

// 版本和自检：看浏览器里跑的是不是刚打的这一版；入库卡住时，把每一步通不通、用时列出来（L-26）
const stamp = (iso: string) => { const t = beijingTime(new Date(iso)); return `${t.date} ${t.time}`; };
$('build').textContent = `版本 ${browser.runtime.getManifest().version} · 打包于 ${stamp(BUILD)}（北京时间）`;
const lines = (steps: DiagStep[]) => steps.map(s => `  ${s.step}：${s.out}（${s.ms}ms）`).join('\n');
$('diag').addEventListener('click', async () => {
  const out = $('diagOut');
  out.hidden = false;
  out.textContent = '自检中…';
  const steps = await diagnose();
  void savePageDiag(steps).catch(() => undefined);
  const here = `设置页（打包于 ${stamp(BUILD)}）\n${lines(steps)}`;
  out.textContent = `${here}\n后台：检查中…`;
  const res = (await Promise.race([
    browser.runtime.sendMessage({ type: 'diag' } satisfies Request).catch((e: Error) => ({ ok: false, error: e.message })),
    new Promise(r => setTimeout(r, 20_000, { ok: false, error: '20 秒没回话' })),
  ])) as Response | undefined;
  out.textContent = `${here}\n${res?.ok && res.diag
    ? `后台（打包于 ${stamp(res.diag.build)}${res.diag.build === BUILD ? '' : '，和设置页不是同一版，去扩展页点一下刷新'}）\n${lines(res.diag.steps)}`
    : `后台：${res?.ok === false ? res.error : '无响应'}`}`;
});

void render();
void loadWhere().then(v => { where.value = v; void checkWhere(false); });
