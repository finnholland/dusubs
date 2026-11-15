// @ts-check
import { browser, cfg, savedWords, renderState } from './state.js';
import { topBox, bottomBox, tooltip } from './dom.js';
import { detectLang, getActiveLearnLang } from './detect-lang.js';
import { getLang } from './langs/index.js';

let fadeTimer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);

/** @param {Element} [anchor] */
export function positionTooltip(anchor) {
  const r = (anchor || topBox).getBoundingClientRect();
  const gap = 8;
  const rt = anchor && anchor.querySelector('rt');
  const rtGap = rt ? rt.getBoundingClientRect().height : 0;
  let top = r.top - tooltip.offsetHeight - gap - rtGap;
  if (top < gap) top = r.bottom + gap;
  let left = r.left + r.width / 2 - tooltip.offsetWidth / 2;
  left = Math.max(gap, Math.min(left, window.innerWidth - tooltip.offsetWidth - gap));
  tooltip.style.top = top + 'px';
  tooltip.style.left = left + 'px';
}

export function hideTooltip() {
  tooltip.classList.remove('hpf-tip-visible');
  const btn = tooltip.querySelector('.hpf-tip-save');
  if (btn) { btn.textContent = 'Save word'; btn.classList.remove('saved'); }
}

export function startFade() {
  fadeTimer = setTimeout(hideTooltip, 250);
}

/** @param {string} en */
export function trimDefinition(en) {
  const shortDef = en.split(';').slice(0, 4).join(';');
  const stripped = shortDef.replace(/\[.*?\]\s*/g, '').replace(/\(.*?\)\s*/g, '').replace(/;{2,}/g, ';').replace(/;\s*$/, '').trim();
  if (stripped === ';') {
    const parenGroups = shortDef.match(/\(.*?\)/g) || [];
    return parenGroups.slice(0, 2).join('; ');
  }
  return stripped;
}

/** @param {{ word: string, pinyin: string, defs: string }} result @param {Element} [anchor] */
export function showTooltip(result, anchor) {
  clearTimeout(fadeTimer);
  fadeTimer = undefined;
  const alreadySaved = savedWords.has(result.word);

  const wordDiv = document.createElement('div');
  wordDiv.className = 'hpf-tip-word';
  wordDiv.style.color = cfg.track1Color;
  wordDiv.textContent = result.word;

  const pinyinDiv = document.createElement('div');
  pinyinDiv.className = 'hpf-tip-pinyin';
  pinyinDiv.textContent = result.pinyin;

  const defsDiv = document.createElement('div');
  defsDiv.className = 'hpf-tip-defs';
  defsDiv.textContent = trimDefinition(result.defs);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'hpf-tip-save' + (alreadySaved ? ' saved' : '');
  saveBtn.textContent = alreadySaved ? 'Saved ✓' : 'Save word';
  saveBtn.addEventListener('click', () =>
    savedWords.has(result.word) ? unsaveWord(result) : saveWord(result));

  tooltip.replaceChildren(wordDiv, pinyinDiv, defsDiv, saveBtn);
  tooltip.classList.add('hpf-tip-visible');
  positionTooltip(anchor);
}

/** @param {boolean} saved */
function setSaveButtonState(saved) {
  const btn = tooltip.querySelector('.hpf-tip-save');
  if (!btn) return;
  btn.textContent = saved ? 'Saved ✓' : 'Save word';
  btn.classList.toggle('saved', saved);
}

/**
 * Persists a change to the stored word list, then mirrors it in the in-memory set and button.
 * @param {string} word @param {Record<string, unknown> | null} entry null deletes the word
 */
function persistWord(word, entry) {
  browser.storage.local.get({ savedWords: {} }).then(({ savedWords: stored }) => {
    if (entry) stored[word] = entry; else delete stored[word];
    return browser.storage.local.set({ savedWords: stored });
  }).then(() => {
    if (entry) savedWords.add(word); else savedWords.delete(word);
    setSaveButtonState(!!entry);
  }).catch(err => console.error('storage error:', err));
}

/** @param {{ word: string, pinyin: string, defs: string }} result */
function saveWord(result) {
  const video = document.querySelector('video');
  const t = video ? video.currentTime - 2 : 0;
  const sep = location.href.includes('?') ? '&' : '?';
  const baseUrl = location.href.replace(/([&?])t=[^&]*/g, '').replace(/\?$/, '');
  const url = baseUrl + sep + 't=' + Math.floor(t);
  const activeLang = getActiveLearnLang(cfg);
  const topIsLearning = detectLang(cfg.track1 || '') === activeLang;
  persistWord(result.word, {
    char: result.word,
    reading: result.pinyin,
    en: trimDefinition(result.defs),
    sentNative: (topIsLearning ? renderState.lastTop : renderState.lastBottom) || null,
    sentOther: (topIsLearning ? renderState.lastBottom : renderState.lastTop) || null,
    url,
    language: activeLang,
    leitnerBox: 1,
    lastReviewed: null,
    nextReview: null,
  });
}

/** @param {{ word: string }} result */
function unsaveWord(result) {
  persistWord(result.word, null);
}

/** @param {HTMLElement} box @param {() => string} trackFn @param {() => string} getLastText */
export function attachHover(box, trackFn, getLastText) {
  box.addEventListener('mouseover', (e) => {
    const track = trackFn();
    const learnLang = getActiveLearnLang(cfg);
    if (!learnLang || !track || !track.startsWith(learnLang)) return;
    const hit = getLang(learnLang).hover(/** @type {Element} */ (e.target), { box, text: getLastText() });
    if (hit) showTooltip(hit.result, hit.anchor);
  });
  box.addEventListener('mouseleave', startFade);
}

// Wire up hover on both subtitle boxes
attachHover(topBox, () => cfg.track1, () => renderState.lastTop);
attachHover(bottomBox, () => cfg.track2, () => renderState.lastBottom);
tooltip.addEventListener('mouseenter', () => { clearTimeout(fadeTimer); fadeTimer = undefined; });
tooltip.addEventListener('mouseleave', hideTooltip);
