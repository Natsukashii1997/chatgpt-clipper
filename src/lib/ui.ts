// 收藏按钮（左侧书签丝带）与右下角进度卡，方案三（用户 2026-11-02 选定）。
// 都放在 Shadow DOM 里：不受 ChatGPT 样式影响；宿主带 UI_ATTR，快照时排除，不会截进长图。
import { ANSWER_GUTTER } from './adapter';

export const UI_ATTR = 'data-clipper-ui';
export const STEPS = ['快照', 'PNG 文件', 'MD 文件', '入库'] as const;
export type RibbonState = 'idle' | 'busy' | 'done' | 'err';

// 丝带吸顶时离滚动容器顶部的距离，避开 ChatGPT 顶栏（52px）
const STICKY_TOP = 64;
// 丝带画在回答左侧空白里，再往左会被 ChatGPT 外层容器裁掉
const RIBBON_W = 16, RIBBON_LEFT = -(ANSWER_GUTTER - 1);

const RIBBON_CSS = `
:host{all:initial;display:block;position:absolute;top:0;bottom:0;left:${RIBBON_LEFT}px;width:${RIBBON_W}px;pointer-events:none}
.st{position:sticky;top:${STICKY_TOP}px}
.rib{pointer-events:auto;display:block;width:${RIBBON_W}px;height:44px;border:0;padding:0;margin:0;cursor:pointer;
  background:#ffb020;clip-path:polygon(0 0,100% 0,100% 100%,50% 82%,0 100%);opacity:.35;transition:height .18s,opacity .18s}
.rib:hover,.rib:focus-visible{height:60px;opacity:1;outline:none}
.rib.on{opacity:1}
.rib.busy{background:#2f6bff;cursor:progress}
.rib.done{background:#10a37f;opacity:.75}
.rib.err{background:#d93025}
.rib.pick{height:60px;opacity:1;background:repeating-linear-gradient(135deg,#2f6bff 0 5px,#7ea2ff 5px 10px)}
.pill{display:none;position:absolute;left:0;top:-24px;white-space:nowrap;padding:2px 9px;border-radius:999px;background:#fff;color:#2f6bff;border:1px solid #2f6bff;
  box-shadow:0 3px 10px rgba(0,0,0,.12);font:11px/16px -apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif}
.rib.pick+.pill{display:block}`;

const DOCK_CSS = `
:host{all:initial}
.dock{position:fixed;right:16px;bottom:96px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;width:280px;
  font:12px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;color:#0d0d0d}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.12);padding:12px 14px}
.hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.hd b{font-size:13px;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hd span{color:#6b6b6b;flex:none}
ol{list-style:none;margin:12px 0 0;padding:0;display:grid;grid-template-columns:repeat(${STEPS.length},1fr);position:relative}
ol::before{content:"";position:absolute;left:${50 / STEPS.length}%;right:${50 / STEPS.length}%;top:8px;height:2px;background:#ececec}
li{text-align:center;position:relative;color:#9a9a9a;font-size:11px}
li i{display:block;width:18px;height:18px;margin:0 auto 4px;border-radius:50%;background:#fff;border:2px solid #dcdcdc;
  font-style:normal;font-size:10px;line-height:14px;color:#fff;font-weight:700}
li.ok{color:#0d0d0d}li.ok i{background:#10a37f;border-color:#10a37f}
li.on{color:#2f6bff}li.on i{border-color:#2f6bff;border-top-color:#eaf0ff;animation:spin .8s linear infinite}
li.bad{color:#d93025}li.bad i{background:#d93025;border-color:#d93025}
li.warn{color:#b26a00}li.warn i{background:#f0a400;border-color:#f0a400}
li small{display:block;color:#6b6b6b;font-size:10px}
@keyframes spin{to{transform:rotate(360deg)}}
.loc{margin-top:12px;padding:8px 10px;border-radius:8px;display:flex;gap:8px;align-items:center}
.loc.ok{background:#e7f6f1}.loc.bad{background:#fdecea}.loc.warn{background:#fff4dc}
.loc .k{font-size:15px;flex:none}
.loc .v{flex:1;min-width:0}
.loc .v div:first-child{font-weight:600}
.loc .v div:nth-child(2){color:#6b6b6b;overflow-wrap:anywhere}
.loc.link{cursor:pointer}
.loc.link:hover{background:#d5efe6;box-shadow:inset 0 0 0 1px #9fd8c5}
.loc.link .v .go{display:none;color:#10a37f;font-weight:600}
.loc.link:hover .v .sub{display:none}
.loc.link:hover .v .go{display:block}
button.a{font:inherit;border:1px solid #0d0d0d;background:#0d0d0d;color:#fff;border-radius:7px;padding:3px 10px;cursor:pointer;flex:none}
button.a:hover{background:#333}
.why{margin-top:10px}
.why input{box-sizing:border-box;width:100%;font:inherit;color:inherit;border:1px solid #d6d6d2;border-radius:7px;padding:5px 8px;outline:none;background:#fff}
.why input:focus{border-color:#2f6bff;box-shadow:0 0 0 3px #eaf0ff}
.why input::placeholder{color:#a3a3a3}
.why .hint{display:none;color:#9a9a9a;font-size:10.5px;margin-top:4px}
.why:focus-within .hint,.why .hint.err{display:block}
.why .hint.err{color:#d93025}
.said{margin-top:10px;padding:6px 9px;border-left:3px solid #10a37f;background:#f6fbf9;border-radius:0 6px 6px 0;display:flex;gap:6px;align-items:baseline}
.said span{flex:1;min-width:0;overflow-wrap:anywhere}
.said button{font:inherit;font-size:11px;color:#6b6b6b;background:none;border:0;padding:0;cursor:pointer;flex:none}
.said button:hover{color:#0d0d0d}
.toast{background:#fff;border:1px solid #f1d8a8;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.12);padding:10px 12px;display:flex;gap:9px;align-items:flex-start}
.toast .ic{width:20px;height:20px;border-radius:50%;background:#f0a400;color:#fff;font-weight:700;display:grid;place-items:center;flex:none}
.toast b{display:block;font-size:12.5px}
.toast .s{color:#6b6b6b}
.toast button{font:inherit;color:#a3a3a3;background:none;border:0;padding:0;margin-left:auto;cursor:pointer;flex:none}
.toast button:hover{color:#0d0d0d}`;

function shadowHost(tag: string, css: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement(tag);
  host.setAttribute(UI_ATTR, '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${css}</style>`;
  return { host, root };
}

/** 在回答里挂一条丝带（绝对定位在左侧空白处，不影响回答布局）。
 *  pick(n)：回答里选中了 n 块时丝带变成蓝色斜纹「荧光笔」，上方标签写块数，点它只收这几块（FR-12，用户 2026-11-04 选定 C 版样式）；n 为 0 恢复 */
export function mountRibbon(answer: HTMLElement, onClick: () => void) {
  if (getComputedStyle(answer).position === 'static') answer.style.position = 'relative';
  const { host, root } = shadowHost('clipper-ribbon', RIBBON_CSS);
  root.innerHTML += '<div class="st"><button class="rib" title="收藏这条回答" aria-label="收藏这条回答"></button><div class="pill"></div></div>';
  const btn = root.querySelector('button')!, pill = root.querySelector<HTMLElement>('.pill')!;
  let state: RibbonState = 'idle', picked = 0;
  const draw = () => {
    const on = btn.classList.contains('on');
    btn.className = `rib ${state !== 'idle' ? state : ''} ${picked && state !== 'busy' ? 'pick' : ''}`;
    btn.classList.toggle('on', on);
    pill.textContent = `收藏选中 · ${picked} 块`;
    btn.title = picked ? `只收藏选中的 ${picked} 块` : '收藏这条回答';
    btn.setAttribute('aria-label', btn.title);
  };
  // 点丝带不清掉选区
  btn.addEventListener('pointerdown', e => e.preventDefault());
  btn.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  // 鼠标在回答上时丝带变实
  answer.addEventListener('mouseenter', () => btn.classList.add('on'));
  answer.addEventListener('mouseleave', () => btn.classList.remove('on'));
  answer.appendChild(host);
  return {
    set(s: RibbonState) { state = s; draw(); },
    pick(n: number) { if (n !== picked) { picked = n; draw(); } },
  };
}

let dockRoot: HTMLElement | null = null;
function dock(): HTMLElement {
  if (dockRoot?.isConnected) return dockRoot;
  const { host, root } = shadowHost('clipper-dock', DOCK_CSS);
  root.innerHTML += '<div class="dock"></div>';
  document.body.appendChild(host);
  return (dockRoot = root.querySelector('.dock')!);
}

export type StepState = '' | 'on' | 'ok' | 'warn' | 'bad';
const ICON: Record<StepState, string> = { '': '', on: '', ok: '✓', warn: '!', bad: '!' };

/** 结束时底部的「存到哪里」：图标、第一行（收藏文件夹或结果）、第二行（子文件夹或原因）；warn 存下了但改版自检没过，标黄；
 *  open 整块可点（在 Obsidian 里打开），悬停时第二行换成 label；href 是要打开的链接（记在块上，便于排查） */
export interface Place { icon: string; head: string; sub: string; warn?: boolean; open?: { label: string; href?: string; run: () => void } }

/** 右下角一张进度卡（B 版，用户 2026-11-02 选定）：顶部是收藏状态，四步横排成一条进度线，每步下面一个短结果；结束时给「存到哪里」和操作按钮 */
export function progressCard() {
  const el = document.createElement('div'), t0 = performance.now();
  el.className = 'card';
  const states: StepState[] = STEPS.map(() => ''), notes: string[] = STEPS.map(() => '');
  const draw = () => {
    el.innerHTML = `<div class="hd"><b></b><span>${((performance.now() - t0) / 1000).toFixed(1)}s</span></div><ol>${STEPS.map(
      (s, i) => `<li class="${states[i]}"><i>${ICON[states[i]!]}</i>${s}${notes[i] ? `<small>${escape(notes[i]!)}</small>` : ''}</li>`).join('')}</ol>`;
    el.querySelector('b')!.textContent = headline;
  };
  let headline = '收藏中…';
  draw();
  dock().appendChild(el);
  let timer = 0;
  return {
    step(i: number, state: StepState, note = '') { states[i] = state; notes[i] = note; draw(); },
    finish(ok: boolean, status: string, place: Place, action?: { label: string; run: () => void }, autoCloseMs = 0, why?: Why) {
      headline = status;
      if (!ok) states.forEach((st, i) => { if (st === 'on') states[i] = 'bad'; });   // 没做完的那步算失败，不再转圈
      draw();
      el.classList.add(ok ? 'ok' : 'bad');
      el.insertAdjacentHTML('beforeend', `<div class="loc ${place.warn ? 'warn' : ok ? 'ok' : 'bad'}"><span class="k"></span><div class="v"><div></div><div class="sub"></div></div></div>`);
      const loc = el.querySelector('.loc')!, [head, sub] = loc.querySelectorAll('.v div');
      loc.querySelector('.k')!.textContent = place.icon;
      head!.textContent = place.head;
      sub!.textContent = place.sub;
      if (!place.sub) sub!.remove();
      if (place.open) {
        const go = document.createElement('div');
        go.className = 'go';
        go.textContent = place.open.label;
        loc.querySelector('.v')!.appendChild(go);
        loc.classList.add('link');
        if (place.open.href) (loc as HTMLElement).dataset.href = place.open.href;
        loc.addEventListener('click', place.open.run);
      }
      if (action) {
        const b = document.createElement('button');
        b.className = 'a';
        b.textContent = action.label;
        b.addEventListener('click', action.run);
        loc.appendChild(b);
      }
      // 鼠标停在卡片上、正在写「为什么存」时不自动关
      let typing = false;
      const arm = () => {
        clearTimeout(timer);
        if (autoCloseMs && !typing && !el.matches(':hover')) timer = window.setTimeout(() => el.remove(), autoCloseMs);
      };
      if (why) whyBox(el, why, t => { typing = t; arm(); });
      el.addEventListener('mouseenter', () => clearTimeout(timer));
      el.addEventListener('mouseleave', arm);
      arm();
    },
    close() { clearTimeout(timer); el.remove(); },
  };
}

/** 收藏后补一句「为什么存」（2026-11-04 用户选定 A 版）：value 是笔记里已有的那句，save 把新写的补进笔记 */
export interface Why { value: string; save: (why: string) => Promise<void> }

function whyBox(card: HTMLElement, why: Why, typing: (t: boolean) => void) {
  const box = document.createElement('div');
  card.appendChild(box);
  let value = why.value;
  const said = () => {
    box.className = 'said';
    box.innerHTML = '<span></span><button>改</button>';
    box.querySelector('span')!.textContent = value;
    box.querySelector('button')!.addEventListener('click', () => edit(true));
  };
  const edit = (focus: boolean) => {
    box.className = 'why';
    box.innerHTML = '<input maxlength="200" placeholder="为什么存？写一句（可不填）"><div class="hint">回车记下 · Esc 不写了</div>';
    const input = box.querySelector('input')!, hint = box.querySelector('.hint')!;
    input.value = value;
    const done = () => { typing(false); if (value) said(); else if (box.contains(input)) input.blur(); };
    input.addEventListener('focus', () => typing(true));
    input.addEventListener('blur', () => typing(false));
    // 按键不往页面传：ChatGPT、Claude 会把键盘输入抢到自己的输入框
    for (const t of ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'paste'] as const) input.addEventListener(t, e => e.stopPropagation());
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { input.value = value; done(); return; }
      // 输入法选字时的回车不算
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      const next = input.value.replace(/\s+/g, ' ').trim();
      input.disabled = true;
      hint.className = 'hint';
      hint.textContent = '记下中…';
      why.save(next).then(() => {
        value = next;
        input.disabled = false;
        hint.textContent = '回车记下 · Esc 不写了';
        done();
      }, (err: Error) => {
        input.disabled = false;
        input.focus();
        hint.className = 'hint err';
        hint.textContent = `没记下：${err.message}`;
      });
    });
    if (focus) input.focus();
  };
  if (value) said();
  else edit(false);
}

/** 跳回原回答（2026-11-04 用户改选 C 版：开头一抹淡黄）：回答开头铺一层很淡的黄色、往下渐隐，没有边框；
 *  丝带同时变黄，停一下一起淡回去 */
export function flashAnswer(answer: HTMLElement) {
  if (getComputedStyle(answer).position === 'static') answer.style.position = 'relative';
  const { host } = shadowHost('clipper-flash', '');
  host.style.cssText = 'position:absolute;left:-10px;right:-6px;top:-6px;height:150px;border-radius:10px;pointer-events:none;z-index:1;'
    + 'background:linear-gradient(to bottom,rgba(255,176,32,.16),rgba(255,176,32,0))';
  answer.appendChild(host);
  const timing = { duration: 2600, easing: 'ease-out' };
  host.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], timing).onfinish = () => host.remove();
  answer.querySelector(':scope > clipper-ribbon')?.shadowRoot?.querySelector('.rib')
    ?.animate([{ background: '#ffb020', opacity: 1 }, { background: '#ffb020', opacity: 1, offset: 0.65 }, {}], timing);
}

/** 右下角一条黄色提醒，点 ✕ 关（改版自检：丝带一条都没挂上） */
export function notice(title: string, text: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span class="ic">!</span><div><b></b><div class="s"></div></div><button title="关闭" aria-label="关闭">✕</button>';
  el.querySelector('b')!.textContent = title;
  el.querySelector('.s')!.textContent = text;
  el.querySelector('button')!.addEventListener('click', () => el.remove());
  dock().appendChild(el);
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
