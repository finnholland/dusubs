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
const togStroke = document.getElementById('tog-stroke');
const togWindow = document.getElementById('tog-window');
const togShadow = document.getElementById('tog-shadow');

const DEFAULTS = {
  fontScale: 100, subPosition: 8,
  zhTrack: '', enTrack: '',
  zhColor: '#ffffff', enColor: '#ffe97a',
  stroke: true, window: false, shadow: false,
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
  togStroke.checked = s.stroke;
  togWindow.checked = s.window;
  togShadow.checked = s.shadow;
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

togStroke.addEventListener('change', () => browser.storage.local.set({ stroke: togStroke.checked }));
togWindow.addEventListener('change', () => browser.storage.local.set({ window: togWindow.checked }));
togShadow.addEventListener('change', () => browser.storage.local.set({ shadow: togShadow.checked }));

browser.storage.onChanged.addListener((changes) => {
  if ('availableTracks' in changes) {
    browser.storage.local.get({ zhTrack: '', enTrack: '' }).then(s =>
      populateTracks(changes.availableTracks.newValue, s.zhTrack, s.enTrack));
  }
});