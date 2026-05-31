const dual = document.getElementById('dual');
const zhSel = document.getElementById('zh-track');
const enSel = document.getElementById('en-track');

browser.storage.local.get({ dualEnable: true, availableTracks: [], zhTrack: '', enTrack: '' }).then(s => {
  dual.checked = s.dualEnable;
  populateTracks(s.availableTracks, s.zhTrack, s.enTrack);
});

function populateTracks(tracks, zhTrack, enTrack) {
  [zhSel, enSel].forEach(sel => { sel.innerHTML = '<option value="">Auto-detect</option>'; });
  tracks.forEach(t => {
    zhSel.appendChild(Object.assign(document.createElement('option'), { value: t.languageCode, textContent: t.name }));
    enSel.appendChild(Object.assign(document.createElement('option'), { value: t.languageCode, textContent: t.name }));
  });
  zhSel.value = zhTrack;
  enSel.value = enTrack;
}

dual.addEventListener('change', () => browser.storage.local.set({ dualEnable: dual.checked }));
zhSel.addEventListener('change', () => browser.storage.local.set({ zhTrack: zhSel.value }));
enSel.addEventListener('change', () => browser.storage.local.set({ enTrack: enSel.value }));

browser.storage.onChanged.addListener((changes) => {
  if ('availableTracks' in changes) {
    browser.storage.local.get({ zhTrack: '', enTrack: '' }).then(s =>
      populateTracks(changes.availableTracks.newValue, s.zhTrack, s.enTrack));
  }
});
