// @ts-check
import { cfg, renderState } from './state.js';

export const styleEl = document.createElement('style');
styleEl.textContent = `
  #hpf-root {
    position: absolute;
    z-index: 2147483647;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    left: 50%;
    transform: translateX(-50%);
    max-width: 90%;
  }
  .hpf-box {
    width: max-content;
    max-width: 100%;
    text-align: center;
    flex-shrink: 0;
    transition: opacity 0.15s ease;
  }
  .hpf-box ruby {
    letter-spacing: 0;
    margin-right: 0.15em;
    pointer-events: auto;
    cursor: default;
  }
  .hpf-box rt {
    font-family: Arial, sans-serif;
    font-size: 0.45em;
    line-height: 1.2;
    letter-spacing: 0;
  }
  #hpf-tooltip {
    position: fixed;
    z-index: 2147483647;
    background: rgba(10,10,10,0.85);
    backdrop-filter: blur(4px);
    color: #eee;
    border: 1px solid #44446a;
    border-radius: 8px;
    padding: 10px 14px;
    max-width: 320px;
    font-family: sans-serif;
    line-height: 1.4;
    box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }
  #hpf-tooltip.hpf-tip-visible {
    opacity: 1;
    pointer-events: auto;
  }
  .hpf-tip-word { font-size: 28px; font-weight: normal; }
  .hpf-tip-pinyin { font-size: 16px; margin-top: 2px; }
  .hpf-tip-defs { font-size: 14px; color: #ccc; margin-top: 6px; }
  .hpf-tip-save {
    display: block;
    margin-top: 8px;
    padding: 4px 10px;
    font-size: 12px;
    background: rgba(255,255,255,0.1);
    border: 1px solid #44446a;
    border-radius: 4px;
    color: #eee;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
  }
  .hpf-tip-save:hover { background: rgba(255,255,255,0.2); }
  .hpf-tip-save.saved { color: #7ef07e; border-color: #7ef07e; }
  .hpf-box rt { color: #fff; }
  .hpf-box .dusub-word {
    pointer-events: auto;
    cursor: default;
    display: inline;
  }
`;
document.head.appendChild(styleEl);

export const root = document.createElement('div'); root.id = 'hpf-root';
export const topBox = document.createElement('div'); topBox.className = 'hpf-box';
export const bottomBox = document.createElement('div'); bottomBox.className = 'hpf-box';
root.appendChild(topBox);
root.appendChild(bottomBox);

export const tooltip = document.createElement('div'); tooltip.id = 'hpf-tooltip';

const PLAYER_SEL = '.html5-video-player, .bpx-player-container';
export let overlayContainer = null;

export function attachOverlay() {
  const player = document.querySelector(PLAYER_SEL);
  const target = player || document.body;
  if (overlayContainer !== target || !target.contains(root)) {
    overlayContainer = target;
    target.appendChild(root);
    root.style.position = player ? 'absolute' : 'fixed';
  }
  if (!document.body.contains(tooltip)) document.body.appendChild(tooltip);
}

if (document.body) attachOverlay();
else document.addEventListener('DOMContentLoaded', attachOverlay);

// ── Site subtitle hiding ───────────────────────────────────────────────────
let siteSubsHidden = false;
let siteSubsStyleEl = null;

export function hideSiteSubs() {
  if (document.hidden) return;
  if (!cfg.track1 && !cfg.track2) return;
  if (siteSubsHidden || (!renderState.lastTop && !renderState.lastBottom)) return;
  const hide = document.createElement('style');
  hide.textContent = `
    .ytp-caption-window-container { opacity: 0 !important; }
    .bpx-player-subtitle-wrap     { opacity: 0 !important; }
  `;
  document.head.appendChild(hide);
  siteSubsStyleEl = hide;
  siteSubsHidden = true;
}

export function showSiteSubs() {
  if (siteSubsStyleEl) { siteSubsStyleEl.remove(); siteSubsStyleEl = null; }
  siteSubsHidden = false;
}

setTimeout(hideSiteSubs, 5000);
setInterval(hideSiteSubs, 2000);
