const dual = document.getElementById('dual');

browser.storage.sync.get({ dualEnable: false }).then(s => {
  dual.checked = s.dualEnable;
});

dual.addEventListener('change', () => {
  browser.storage.sync.set({ dualEnable: dual.checked });
});