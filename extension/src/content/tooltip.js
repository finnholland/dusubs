// @ts-check
import { browser, LOG, cfg, savedZh, renderState } from './state.js';
import { topBox, bottomBox, tooltip } from './dom.js';
import { loadDict, lookupWord, loadJaDict, getJaDict, getJaRdIndex, getHpfDict, hasKanji, detectLang } from './lang.js';

let fadeTimer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);

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
  const alreadySaved = savedZh.has(result.word);

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
    savedZh.has(result.word) ? unsaveWord(result) : saveWord(result));

  tooltip.replaceChildren(wordDiv, pinyinDiv, defsDiv, saveBtn);
  tooltip.classList.add('hpf-tip-visible');
  positionTooltip(anchor);
}

/** @param {{ word: string, pinyin: string, defs: string }} result */
function saveWord(result) {
  const video = document.querySelector('video');
  const t = video ? video.currentTime - 2 : 0;
  const sep = location.href.includes('?') ? '&' : '?';
  const baseUrl = location.href.replace(/([&?])t=[^&]*/g, '').replace(/\?$/, '');
  const url = baseUrl + sep + 't=' + Math.floor(t);
  const topIsLearning = detectLang(cfg.track1 || '') === cfg.learnMode;
  const entry = { char: result.word, py: result.pinyin, en: trimDefinition(result.defs), sentNative: (topIsLearning ? renderState.lastTop : renderState.lastBottom) || null, sentOther: (topIsLearning ? renderState.lastBottom : renderState.lastTop) || null, url, language: cfg.learnMode, leitnerBox: 1, lastReviewed: null, nextReview: null };
  browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
    savedWords[result.word] = entry;
    return browser.storage.local.set({ savedWords });
  }).then(() => {
    savedZh.add(result.word);
    const btn = tooltip.querySelector('.hpf-tip-save');
    if (btn) { btn.textContent = 'Saved ✓'; btn.classList.add('saved'); }
  }).catch(err => console.error('storage error:', err));
}

/** @param {{ word: string, pinyin: string, defs: string }} result */
function unsaveWord(result) {
  browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
    delete savedWords[result.word];
    return browser.storage.local.set({ savedWords });
  }).then(() => {
    savedZh.delete(result.word);
    const btn = tooltip.querySelector('.hpf-tip-save');
    if (btn) { btn.textContent = 'Save word'; btn.classList.remove('saved'); }
  }).catch(err => console.error('storage error:', err));
}

export function attachHover(box, trackFn, getLastText) {
  box.addEventListener('mouseover', (e) => {
    const track = trackFn();
    if (cfg.learnMode === 'none' || !track || !track.startsWith(cfg.learnMode)) return;

    if (cfg.learnMode === 'ja') {
      const wordSpan = /** @type {Element} */ (e.target).closest('.dusub-word[data-base]');
      if (!wordSpan) return;
      const jaDict = getJaDict();
      if (!jaDict) { loadJaDict(); return; }
      const el = /** @type {HTMLElement} */ (wordSpan);
      const base = el.dataset.base;
      const pos = el.dataset.pos ?? '';
      if (pos === '助詞' || pos === '助動詞') {
        const GRAMMAR = /** @type {Record<string, [string, string]>} */ ({
          'の': ['no',  'particle — possession / noun modification / nominalizer'],
          'に': ['ni',  'particle — location, time, direction, indirect object'],
          'を': ['wo',  'particle — direct object'],
          'は': ['wa',  'particle — topic marker'],
          'が': ['ga',  'particle — subject marker'],
          'で': ['de',  'particle — location of action, means, cause'],
          'と': ['to',  'particle — and / with / if (conditional) / quotation'],
          'も': ['mo',  'particle — also / too / even'],
          'へ': ['e',   'particle — direction (toward)'],
          'から': ['kara', 'particle — from / because'],
          'まで': ['made', 'particle — until / up to'],
          'より': ['yori', 'particle — than / from'],
          'か': ['ka',  'particle — question marker'],
          'ね': ['ne',  'particle — seeking agreement (right? / isn\'t it?)'],
          'よ': ['yo',  'particle — assertion / emphasis'],
          'ます': ['masu', 'auxiliary — polite verb ending'],
          'です': ['desu', 'auxiliary — polite copula (is / am / are)'],
          'た':  ['ta',  'auxiliary — past tense'],
          'て':  ['te',  'auxiliary — te-form connector'],
          'ない': ['nai', 'auxiliary — negation'],
          'ている': ['te iru', 'auxiliary — ongoing action / resultant state'],
        });
        const [romaji, defs] = GRAMMAR[base] ?? ['', pos === '助動詞' ? 'auxiliary verb ending' : 'particle'];
        showTooltip({ word: base, pinyin: romaji, defs }, el);
        return;
      }
      const entry = jaDict[base] ?? getJaRdIndex()?.[el.dataset.rd ?? ''];
      if (!entry) return;
      const defs = entry.en.join('; ');
      const entryPos = entry.pos ? `[${entry.pos}] ` : '';
      const romaji = entry.rm || '';
      const reading = hasKanji(base)
        ? [entry.rd, romaji].filter(Boolean).join('  ')
        : romaji || entry.rd;
      showTooltip({ word: base, pinyin: reading, defs: entryPos + defs }, wordSpan);
      return;
    }

    if (!getHpfDict()) { loadDict(); return; }
    const charEl = /** @type {Element} */ (e.target).closest('[data-idx]');
    if (!charEl) return;
    const idx = parseInt(/** @type {HTMLElement} */(charEl).dataset.idx, 10);
    const result = lookupWord(getLastText(), idx);
    if (!result) return;
    const wordLen = [...result.word].length;
    const charEls = [...box.querySelectorAll('[data-idx]')]
      .filter(r => { const ri = parseInt(/** @type {HTMLElement} */(r).dataset.idx, 10); return ri >= idx && ri < idx + wordLen; });
    const ctxPinyin = charEls.map(r => /** @type {HTMLElement} */(r).dataset.py || '').join(' ').trim();
    showTooltip({ ...result, pinyin: ctxPinyin || result.pinyin }, charEl);
  });
  box.addEventListener('mouseleave', startFade);
}

// Wire up hover on both subtitle boxes
attachHover(topBox, () => cfg.track1, () => renderState.lastTop);
attachHover(bottomBox, () => cfg.track2, () => renderState.lastBottom);
tooltip.addEventListener('mouseenter', () => { clearTimeout(fadeTimer); fadeTimer = undefined; });
tooltip.addEventListener('mouseleave', hideTooltip);
