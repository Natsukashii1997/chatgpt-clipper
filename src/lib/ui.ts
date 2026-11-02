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
.rib{position:sticky;top:${STICKY_TOP}px;pointer-events:auto;display:block;width:${RIBBON_W}px;height:44px;border:0;padding:0;margin:0;cursor:pointer;
  background:#ffb020;clip-path:polygon(0 0,100% 0,100% 100%,50% 82%,0 100%);opacity:.35;transition:height .18s,opacity .18s}
.rib:hover,.rib:focus-visible{height:60px;opacity:1;outline:none}
.rib.on{opacity:1}
.rib.busy{background:#2f6bff;cursor:progress}
.rib.done{background:#10a37f;opacity:.75}
.rib.err{background:#d93025}`;

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
li small{display:block;color:#6b6b6b;font-size:10px}
@keyframes spin{to{transform:rotate(360deg)}}
.loc{margin-top:12px;padding:8px 10px;border-radius:8px;display:flex;gap:8px;align-items:center}
.loc.ok{background:#e7f6f1}.loc.bad{background:#fdecea}
.loc .k{font-size:15px;flex:none}
.loc .v{flex:1;min-width:0}
.loc .v div:first-child{font-weight:600}
.loc .v div:last-child{color:#6b6b6b;overflow-wrap:anywhere}
button.a{font:inherit;border:1px solid #0d0d0d;background:#0d0d0d;color:#fff;border-radius:7px;padding:3px 10px;cursor:pointer;flex:none}
button.a:hover{background:#333}`;

function shadowHost(tag: string, css: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement(tag);
  host.setAttribute(UI_ATTR, '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${css}</style>`;
  return { host, root };
}

/** 在回答里挂一条丝带（绝对定位在左侧空白处，不影响回答布局） */
export function mountRibbon(answer: HTMLElement, onClick: () => void) {
  if (getComputedStyle(answer).position === 'static') answer.style.position = 'relative';
  const { host, root } = shadowHost('clipper-ribbon', RIBBON_CSS);
  root.innerHTML += '<button class="rib" title="收藏这条回答" aria-label="收藏这条回答"></button>';
  const btn = root.querySelector('button')!;
  btn.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  // 鼠标在回答上时丝带变实
  answer.addEventListener('mouseenter', () => btn.classList.add('on'));
  answer.addEventListener('mouseleave', () => btn.classList.remove('on'));
  answer.appendChild(host);
  return {
    set(state: RibbonState) { btn.className = `rib ${state === 'idle' ? '' : state}`; },
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

export type StepState = '' | 'on' | 'ok' | 'bad';
const ICON: Record<StepState, string> = { '': '', on: '', ok: '✓', bad: '!' };

/** 结束时底部的「存到哪里」：图标、第一行（收藏文件夹或结果）、第二行（子文件夹或原因） */
export interface Place { icon: string; head: string; sub: string }

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
    finish(ok: boolean, status: string, place: Place, action?: { label: string; run: () => void }, autoCloseMs = 0) {
      headline = status;
      draw();
      el.classList.add(ok ? 'ok' : 'bad');
      el.insertAdjacentHTML('beforeend', `<div class="loc ${ok ? 'ok' : 'bad'}"><span class="k"></span><div class="v"><div></div><div></div></div></div>`);
      const loc = el.querySelector('.loc')!, [head, sub] = loc.querySelectorAll('.v div');
      loc.querySelector('.k')!.textContent = place.icon;
      head!.textContent = place.head;
      sub!.textContent = place.sub;
      if (!place.sub) sub!.remove();
      if (action) {
        const b = document.createElement('button');
        b.className = 'a';
        b.textContent = action.label;
        b.addEventListener('click', action.run);
        loc.appendChild(b);
      }
      // 鼠标停在卡片上时不自动关
      if (autoCloseMs) {
        const arm = () => { timer = window.setTimeout(() => el.remove(), autoCloseMs); };
        el.addEventListener('mouseenter', () => clearTimeout(timer));
        el.addEventListener('mouseleave', arm);
        arm();
      }
    },
    close() { clearTimeout(timer); el.remove(); },
  };
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
