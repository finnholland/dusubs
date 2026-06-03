// @ts-check

/**
 * @typedef {{ languageCode: string, name: string }} Track
 */

const zhSel = document.getElementById('zh-track');
const enSel = document.getElementById('en-track');
const zhColorSel = document.getElementById('zh-color');
const enColorSel = document.getElementById('en-color');
const zhSwatch = document.getElementById('zh-swatch');
const enSwatch = document.getElementById('en-swatch');
const fontScaleIn = document.getElementById('font-scale');
const fontScaleVal = document.getElementById('font-scale-val');
const subPosIn = document.getElementById('sub-position');
const subPosVal = document.getElementById('sub-position-val');
const togPinyin = /** @type {HTMLInputElement} */ (document.getElementById('tog-pinyin'));
const togStroke = /** @type {HTMLInputElement} */ (document.getElementById('tog-stroke'));
const togWindow = /** @type {HTMLInputElement} */ (document.getElementById('tog-window'));
const togShadow = /** @type {HTMLInputElement} */ (document.getElementById('tog-shadow'));
const togSandhi = /** @type {HTMLInputElement} */ (document.getElementById('tog-sandhi'));
const sandhiSub = /** @type {HTMLElement} */ (document.getElementById('sandhi-sub'));

const DEFAULTS = {
  fontScale: 100, subPosition: 8,
  zhTrack: '', enTrack: '',
  zhColor: '#ffffff', enColor: '#ffe97a',
  stroke: true, window: false, shadow: false, showPinyin: true, toneSandhi: true,
};

/**
 * @param {HTMLElement} swatchEl
 * @param {string} color
 */
function updateSwatch(swatchEl, color) {
  swatchEl.style.background = color;
}

browser.storage.local.get({ ...DEFAULTS, availableTracks: [] }).then(s => {
  fontScaleIn.value = s.fontScale;
  fontScaleVal.textContent = s.fontScale + '%';
  subPosIn.value = s.subPosition;
  subPosVal.textContent = s.subPosition + '%';
  zhColorSel.value = s.zhColor;
  enColorSel.value = s.enColor;
  updateSwatch(zhSwatch, s.zhColor);
  updateSwatch(enSwatch, s.enColor);
  togPinyin.checked = s.showPinyin;
  sandhiSub.classList.toggle('hidden', !s.showPinyin);
  togStroke.checked = s.stroke;
  togWindow.checked = s.window;
  togShadow.checked = s.shadow;
  togSandhi.checked = s.toneSandhi ?? true;
  populateTracks(s.availableTracks || [], s.zhTrack, s.enTrack);
});

/**
 * @param {Track[]} tracks
 * @param {string} zhTrack
 * @param {string} enTrack
 */
function populateTracks(tracks, zhTrack, enTrack) {
  [zhSel, enSel].forEach(sel => { sel.innerHTML = ''; });
  if (!tracks.length) {
    const msg = '<option value="">No video open…</option>';
    zhSel.innerHTML = enSel.innerHTML = msg;
    return;
  }
  [zhSel, enSel].forEach(sel => {
    sel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: 'Off' }));
  });
  tracks.forEach(t => {
    [zhSel, enSel].forEach(sel => {
      sel.appendChild(Object.assign(document.createElement('option'), {
        value: t.languageCode, textContent: t.name,
      }));
    });
  });
  const newZh = zhTrack || tracks.find(t => t.languageCode.startsWith('zh'))?.languageCode || '';
  const newEn = enTrack || tracks.find(t => t.languageCode.startsWith('en'))?.languageCode || '';
  zhSel.value = newZh;
  enSel.value = newEn;
  browser.storage.local.set({ zhTrack: newZh, enTrack: newEn });
}

zhSel.addEventListener('change', () => browser.storage.local.set({ zhTrack: zhSel.value }));
enSel.addEventListener('change', () => browser.storage.local.set({ enTrack: enSel.value }));

zhColorSel.addEventListener('change', () => {
  updateSwatch(zhSwatch, zhColorSel.value);
  browser.storage.local.set({ zhColor: zhColorSel.value });
});
enColorSel.addEventListener('change', () => {
  updateSwatch(enSwatch, enColorSel.value);
  browser.storage.local.set({ enColor: enColorSel.value });
});

fontScaleIn.addEventListener('input', () => {
  fontScaleVal.textContent = fontScaleIn.value + '%';
  browser.storage.local.set({ fontScale: Number(fontScaleIn.value) });
});
subPosIn.addEventListener('input', () => {
  subPosVal.textContent = subPosIn.value + '%';
  browser.storage.local.set({ subPosition: Number(subPosIn.value) });
});

togPinyin.addEventListener('change', () => {
  sandhiSub.classList.toggle('hidden', !togPinyin.checked);
  browser.storage.local.set({ showPinyin: togPinyin.checked });
});
togStroke.addEventListener('change', () => browser.storage.local.set({ stroke: togStroke.checked }));
togWindow.addEventListener('change', () => browser.storage.local.set({ window: togWindow.checked }));
togShadow.addEventListener('change', () => browser.storage.local.set({ shadow: togShadow.checked }));
togSandhi.addEventListener('change', () => browser.storage.local.set({ toneSandhi: togSandhi.checked }));

browser.storage.onChanged.addListener((changes) => {
  if ('availableTracks' in changes) {
    browser.storage.local.get({ zhTrack: '', enTrack: '' }).then(s =>
      populateTracks(changes.availableTracks.newValue, s.zhTrack, s.enTrack));
  }
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
    if (tab.dataset.tab === 'words') loadWords();
  });
});

// ── Saved words ───────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loadWords() {
  browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
    const list = document.getElementById('word-list');
    const entries = Object.values(savedWords);
    list.innerHTML = '';
    entries.forEach(w => {
      const row = document.createElement('div');
      row.className = 'word-row';
      row.innerHTML =
        `<span class="word-zh">${escHtml(w.zh)}</span>` +
        `<span class="word-meta">` +
          `<div class="word-py">${escHtml(w.py)}</div>` +
          `<div class="word-en">${escHtml(w.en)}</div>` +
        `</span>` +
        `<button class="word-del" title="Remove">🗑</button>`;
      row.querySelector('.word-del').addEventListener('click', () => deleteWord(w.zh));
      list.appendChild(row);
    });
    document.getElementById('export-btn').disabled = entries.length === 0;
  });
}

function deleteWord(zh) {
  browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
    delete savedWords[zh];
    return browser.storage.local.set({ savedWords });
  }).then(loadWords);
}

function exportWords() {
  browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
    const lines = Object.values(savedWords).map(w => {
      let back = `${escHtml(w.py)}<br>${escHtml(w.en)}`;
      if (w.sentEn || w.sentZh) {
        const sent = [w.sentZh, w.sentEn].filter(Boolean).join(' · ');
        back += `<br><i>${escHtml(sent)}</i>`;
      }
      return `${w.zh}\t${back}`;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    a.download = 'saved-words.txt';
    a.click();
  });
}

document.getElementById('export-btn').addEventListener('click', exportWords);