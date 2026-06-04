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

const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const LINK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

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
        (w.url ? `<a class="word-link" href="${escHtml(w.url)}" target="_blank" title="Open video at time">${LINK_SVG}</a>` : '') +
        `<button class="word-del" title="Remove">${TRASH_SVG}</button>`;
      row.querySelector('.word-del').addEventListener('click', () => deleteWord(w.zh));
      list.appendChild(row);
    });
    document.getElementById('export-btn').disabled = entries.length === 0;
    document.getElementById('delete-all-btn').disabled = entries.length === 0;
  });
}

function deleteWord(zh) {
  browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
    delete savedWords[zh];
    return browser.storage.local.set({ savedWords });
  }).then(loadWords);
}

function downloadText(content, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = filename;
  a.click();
}

function exportAnki(savedWords) {
  const lines = Object.values(savedWords).map(w => {
    const en = w.en.split(';').slice(0, 4).join(';');
    let back = `${escHtml(w.py)}<br>${escHtml(en)}`;
    if (w.sentEn || w.sentZh) {
      const sent = [w.sentZh, w.sentEn].filter(Boolean).join(' · ');
      back += `<br><i>${escHtml(sent)}</i>`;
    }
    return `${w.zh}\t${back}`;
  });
  downloadText(lines.join('\n'), 'saved-words-anki.txt');
}

function exportQuizlet(savedWords) {
  const lines = Object.values(savedWords).map(w => {
    const en = w.en.split(';').slice(0, 2).join(';');
    return `${w.zh}\t${w.py} · ${en}`;
  });
  downloadText(lines.join('\n'), 'saved-words-quizlet.txt');
}

const exportBtn = document.getElementById('export-btn');
const exportSubBtns = document.getElementById('export-sub-btns');

exportBtn.addEventListener('click', () => {
  exportSubBtns.classList.toggle('visible');
});

document.getElementById('export-anki-btn').addEventListener('click', () => {
  browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
    exportAnki(savedWords);
    exportSubBtns.classList.remove('visible');
  });
});

document.getElementById('export-quizlet-btn').addEventListener('click', () => {
  browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
    exportQuizlet(savedWords);
    exportSubBtns.classList.remove('visible');
  });
});

const deleteAllBtn = document.getElementById('delete-all-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

deleteAllBtn.addEventListener('click', () => {
  deleteAllBtn.style.display = 'none';
  confirmDeleteBtn.style.display = '';
  const bar = document.getElementById('confirm-bar');
  bar.replaceWith(bar.cloneNode());
  const t = setTimeout(() => {
    confirmDeleteBtn.style.display = 'none';
    deleteAllBtn.style.display = '';
  }, 3000);
  confirmDeleteBtn._dismissTimer = t;
});

confirmDeleteBtn.addEventListener('click', () => {
  clearTimeout(confirmDeleteBtn._dismissTimer);
  confirmDeleteBtn.style.display = 'none';
  deleteAllBtn.style.display = '';
  browser.storage.local.set({ savedWords: {} }).then(loadWords);
});