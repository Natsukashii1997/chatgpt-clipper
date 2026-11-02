// 收藏按钮（左侧书签丝带）与右下角进度卡，方案三（用户 2026-11-02 选定）。
// 都放在 Shadow DOM 里：不受 ChatGPT 样式影响；宿主带 UI_ATTR，快照时排除，不会截进长图。
import { ANSWER_GUTTER } from './adapter';

export const UI_ATTR = 'data-clipper-ui';
export const STEPS = ['快照', '长图', '下载'] as const;
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
.rib.done{background:#10a37f}
.rib.err{background:#d93025}`;

const DOCK_CSS = `
:host{all:initial}
.dock{position:fixed;right:16px;bottom:96px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;width:248px;
  font:12px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;color:#0d0d0d}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.12);padding:10px 12px}
.card.ok{border-color:#bfe8dc}.card.bad{border-color:#f5c2be}
.t{display:flex;justify-content:space-between;gap:8px;font-weight:600;margin-bottom:6px}
.t b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.t span{color:#5d5d5d;font-weight:400;flex:none}
ol{margin:0;padding:0;list-style:none;display:grid;gap:3px}
li{display:flex;gap:6px;color:#aaa}
li::before{content:"○";width:12px;flex:none}
li.on{color:#0d0d0d}li.on::before{content:"◔";color:#2f6bff}
li.ok{color:#10a37f}li.ok::before{content:"✓"}
li.bad{color:#d93025}li.bad::before{content:"✕"}
.f{margin-top:6px;padding-top:6px;border-top:1px solid #e5e5e5;color:#5d5d5d;display:flex;justify-content:space-between;align-items:center;gap:8px}
.f span{overflow:hidden;text-overflow:ellipsis}
button.a{font:inherit;font-size:11px;border:1px solid #e5e5e5;background:#fff;color:#0d0d0d;border-radius:6px;padding:2px 8px;cursor:pointer;flex:none}
button.a:hover{background:#f6f6f6}`;

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

/** 右下角一张进度卡：逐步打勾、写耗时；结束时给结果和操作按钮 */
export function progressCard(title: string) {
  const el = document.createElement('div'), t0 = performance.now();
  el.className = 'card';
  const states: StepState[] = STEPS.map(() => ''), notes: string[] = STEPS.map(() => '');
  const draw = () => {
    el.innerHTML = `<div class="t"><b></b><span>${((performance.now() - t0) / 1000).toFixed(1)}s</span></div><ol>${STEPS.map(
      (s, i) => `<li class="${states[i]}">${s}${notes[i] ? ` · ${escape(notes[i])}` : ''}</li>`).join('')}</ol>`;
    el.querySelector('b')!.textContent = title || '收藏这条回答';
  };
  draw();
  dock().appendChild(el);
  let timer = 0;
  return {
    step(i: number, state: StepState, note = '') { states[i] = state; notes[i] = note; draw(); },
    finish(ok: boolean, summary: string, action?: { label: string; run: () => void }, autoCloseMs = 0) {
      draw();
      el.classList.add(ok ? 'ok' : 'bad');
      el.insertAdjacentHTML('beforeend', '<div class="f"><span></span></div>');
      el.querySelector('.f span')!.textContent = summary;
      if (action) {
        const b = document.createElement('button');
        b.className = 'a';
        b.textContent = action.label;
        b.addEventListener('click', action.run);
        el.querySelector('.f')!.appendChild(b);
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
