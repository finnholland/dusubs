(function () {
  'use strict';

  const FONT_WOFF2 = browser.runtime.getURL('fonts/Hanzi-Pinyin-Font.top.woff2');
  const FONT_TTF = browser.runtime.getURL('fonts/Hanzi-Pinyin-Font.top.ttf');

  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'HanziPinyin';
      src: url('${FONT_WOFF2}') format('woff2'),
           url('${FONT_TTF}') format('truetype');
    }
    #hpf-root {
      position: fixed;
      bottom: 10%;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      width: 90vw;
    }
    .hpf-box {
      display: inline-block;
      background: rgba(0,0,0,0.82);
      border-radius: 5px;
      padding: 4px 18px 2px;
      max-width: 100%;
      text-align: center;
    }
    .hpf-zh {
      font-family: 'HanziPinyin', sans-serif !important;
      font-size: clamp(32px, 3.5vw, 60px);
      color: #fff;
      line-height: 2.6;
    }
    .hpf-en {
      font-family: Arial, sans-serif;
      font-size: clamp(18px, 2vw, 32px);
      color: #ffe97a;
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);

  // ── Build overlay ──────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'hpf-root';
  const zhBox = document.createElement('div');
  zhBox.className = 'hpf-box hpf-zh';
  const enBox = document.createElement('div');
  enBox.className = 'hpf-box hpf-en';
  root.appendChild(zhBox);
  root.appendChild(enBox);

  function attachOverlay() {
    if (!document.body.contains(root)) document.body.appendChild(root);
  }
  if (document.body) attachOverlay();
  else document.addEventListener('DOMContentLoaded', attachOverlay);

  // ── Settings ───────────────────────────────────────────────────────────────
  let cfg = { dualEnable: false };
  browser.storage.sync.get({ dualEnable: false }).then(s => { cfg = s; applyVisibility(); });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if ('dualEnable' in changes) cfg.dualEnable = changes.dualEnable.newValue;
    applyVisibility();
  });

  function applyVisibility() {
    enBox.style.display = cfg.dualEnable ? '' : 'none';
  }
  applyVisibility();

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isChinese(text) {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
  }

  function readText(selector) {
    return [...document.querySelectorAll(selector)]
      .map(el => el.textContent.trim())
      .filter(Boolean)
      .join(' ');
  }

  let lastZh = '', lastEn = '';

  // ── Main loop ──────────────────────────────────────────────────────────────
  function tick() {
    attachOverlay();
    let zh = '', en = '';

    // YouTube: each caption window is a direct child div of the container.
    // Sort by language so order doesn't matter (user may have added tracks either way).
    for (const win of document.querySelectorAll('.ytp-caption-window-container > div')) {
      const text = [...win.querySelectorAll('.ytp-caption-segment')]
        .map(el => el.textContent.trim()).filter(Boolean).join(' ');
      if (!text) continue;
      if (isChinese(text)) zh = text;
      else en = text;
    }

    // Bilibili fallback
    if (!zh) zh = readText('.bpx-player-subtitle-inner span, .bilibili-player-video-subtitle span');
    if (!en) en = readText('.bpx-player-subtitle-wrap > div:nth-child(2) .bpx-player-subtitle-inner span');

    if (zh !== lastZh) { lastZh = zh; zhBox.textContent = zh; }
    if (en !== lastEn) { lastEn = en; enBox.textContent = en; }
    zhBox.style.display = zh ? '' : 'none';
    enBox.style.display = (en && cfg.dualEnable) ? '' : 'none';
  }

  setInterval(tick, 80);

  // ── Hide the site's own subtitle layer once ours is working ───────────────
  let siteSubsHidden = false;
  function hideSiteSubs() {
    if (siteSubsHidden || !lastZh) return;
    const hide = document.createElement('style');
    hide.textContent = `
      .ytp-caption-window-container { opacity: 0 !important; }
      .bpx-player-subtitle-wrap     { opacity: 0 !important; }
    `;
    document.head.appendChild(hide);
    siteSubsHidden = true;
  }
  setTimeout(hideSiteSubs, 5000);
  setInterval(hideSiteSubs, 2000);

})();