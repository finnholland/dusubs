const dual = document.getElementById('dual');
const zhSel = document.getElementById('zh-track');
const enSel = document.getElementById('en-track');

browser.storage.local.get({ dualEnable: true, availableTracks: [], zhTrack: '', enTrack: '' }).then(s => {
  dual.checked = s.dualEnable;
  populateTracks(s.availableTracks, s.zhTrack, s.enTrack);
});

function populateTracks(tracks, zhTrack, enTrack) {
  [zhSel, enSel].forEach(sel => { sel.innerHTML = ''; });

  if (!tracks.length) {
    const msg = '<option value="" disabled selected>Open a YouTube video with subtitles</option>';
    zhSel.innerHTML = enSel.innerHTML = msg;
    return;
  }

  tracks.forEach(t => {
    zhSel.appendChild(Object.assign(document.createElement('option'), { value: t.languageCode, textContent: t.name }));
    enSel.appendChild(Object.assign(document.createElement('option'), { value: t.languageCode, textContent: t.name }));
  });

  // Use saved selection, or fall back to best Chinese / English match
  zhSel.value = zhTrack || tracks.find(t => (t.languageCode || '').startsWith('zh'))?.languageCode || '';
  enSel.value = enTrack || tracks.find(t => (t.languageCode || '').startsWith('en'))?.languageCode || '';
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
