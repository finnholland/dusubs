"use strict";
(() => {
  // extension/src/content/state.js
  var browser = globalThis.browser ?? globalThis.chrome;
  var CHANNEL = "hpf-main-isolated";
  var LOG = (...a) => console.log("[HPF]", ...a);
  var DEFAULTS = {
    fontScale: 100,
    subPosition: 8,
    track1: "",
    track2: "",
    track1Color: "#ffffff",
    track2Color: "#ffe97a",
    stroke: true,
    window: false,
    shadow: false,
    learnMode: "none",
    pinyinEnabled: true,
    sandhiEnabled: true
  };
  var cfg = { ...DEFAULTS };
  function setCfg(next) {
    cfg = next;
  }
  function patchCfg(patch) {
    Object.assign(cfg, patch);
  }
  var cues = { top: [], bottom: [] };
  var renderState = {
    lastTop: "",
    lastBottom: "",
    lastLogTime: -1,
    /** @type {boolean|null} */
    lastShowPinyin: null,
    /** @type {boolean|null} */
    lastSandhiEnabled: null
  };
  var savedZh = /* @__PURE__ */ new Set();
  var lastTrackUrls = null;
  function setLastTrackUrls(v) {
    lastTrackUrls = v;
  }
  var localTracks = [];
  function setLocalTracks(v) {
    localTracks = v;
  }
  var trackManuallySet = false;
  function setTrackManuallySet(v) {
    trackManuallySet = v;
  }

  // extension/src/content/dom.js
  var styleEl = document.createElement("style");
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
  var root = document.createElement("div");
  root.id = "hpf-root";
  var topBox = document.createElement("div");
  topBox.className = "hpf-box";
  var bottomBox = document.createElement("div");
  bottomBox.className = "hpf-box";
  root.appendChild(topBox);
  root.appendChild(bottomBox);
  var tooltip = document.createElement("div");
  tooltip.id = "hpf-tooltip";
  var PLAYER_SEL = ".html5-video-player, .bpx-player-container";
  var overlayContainer = null;
  function attachOverlay() {
    const player = document.querySelector(PLAYER_SEL);
    const target = player || document.body;
    if (overlayContainer !== target || !target.contains(root)) {
      overlayContainer = target;
      target.appendChild(root);
      root.style.position = player ? "absolute" : "fixed";
    }
    if (!document.body.contains(tooltip)) document.body.appendChild(tooltip);
  }
  if (document.body) attachOverlay();
  else document.addEventListener("DOMContentLoaded", attachOverlay);
  var siteSubsHidden = false;
  var siteSubsStyleEl = null;
  function hideSiteSubs() {
    if (document.hidden) return;
    if (!cfg.track1 && !cfg.track2) return;
    if (siteSubsHidden || !renderState.lastTop && !renderState.lastBottom) return;
    const hide = document.createElement("style");
    hide.textContent = `
    .ytp-caption-window-container { opacity: 0 !important; }
    .bpx-player-subtitle-wrap     { opacity: 0 !important; }
  `;
    document.head.appendChild(hide);
    siteSubsStyleEl = hide;
    siteSubsHidden = true;
  }
  function showSiteSubs() {
    if (siteSubsStyleEl) {
      siteSubsStyleEl.remove();
      siteSubsStyleEl = null;
    }
    siteSubsHidden = false;
  }
  setTimeout(hideSiteSubs, 5e3);
  setInterval(hideSiteSubs, 2e3);

  // extension/src/content/lang.js
  function detectLang(code) {
    if (/^zh/i.test(code)) return "zh";
    if (/^ja/i.test(code)) return "ja";
    return "en";
  }
  var hpfDict = null;
  var dictLoading = false;
  function getHpfDict() {
    return hpfDict;
  }
  async function loadDict() {
    if (hpfDict || dictLoading) return;
    dictLoading = true;
    try {
      const resp = await fetch(browser.runtime.getURL("vendor/cedict.json.gz"));
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      hpfDict = await new Response(resp.body.pipeThrough(new DecompressionStream("gzip"))).json();
      LOG("dict loaded:", Object.keys(hpfDict).length, "entries");
    } catch (e) {
      LOG("dict load failed:", e);
      dictLoading = false;
    }
  }
  function lookupWord(text, idx) {
    if (!hpfDict) return null;
    const chars = [...text];
    for (let len = Math.min(8, chars.length - idx); len >= 1; len--) {
      const word = chars.slice(idx, idx + len).join("");
      const entry = hpfDict[word];
      if (entry) return { word, pinyin: entry[0], defs: entry[1] };
    }
    return null;
  }
  var kuromoji = null;
  var kuromojiLoading = false;
  function getKuromoji() {
    return kuromoji;
  }
  var jaDict = null;
  var jaDictLoading = false;
  function getJaDict() {
    return jaDict;
  }
  async function loadKuromoji() {
    if (kuromoji || kuromojiLoading) return;
    kuromojiLoading = true;
    const lib = globalThis.kuromoji;
    if (!lib?.builder) {
      kuromojiLoading = false;
      return;
    }
    const files = [
      "base",
      "cc",
      "check",
      "tid",
      "tid_pos",
      "tid_map",
      "unk",
      "unk_pos",
      "unk_map",
      "unk_char",
      "unk_compat",
      "unk_invoke"
    ];
    const blobs = {};
    await Promise.all(files.map(async (name) => {
      const res = await fetch(browser.runtime.getURL(`dict/${name}.dat.gz`));
      blobs[`${name}.dat.gz`] = URL.createObjectURL(await res.blob());
    }));
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      const file = url.split("/").pop();
      return origOpen.call(this, method, blobs[file] ?? url);
    };
    try {
      kuromoji = await new Promise(
        (resolve, reject) => lib.builder({ dicPath: browser.runtime.getURL("dict/") }).build((err, tok) => err ? reject(err) : resolve(tok))
      );
      XMLHttpRequest.prototype.open = origOpen;
      Object.values(blobs).forEach(URL.revokeObjectURL);
      LOG("kuromoji loaded \u2713");
    } catch (e) {
      XMLHttpRequest.prototype.open = origOpen;
      LOG("kuromoji load failed:", e);
      kuromojiLoading = false;
    }
  }
  async function loadJaDict() {
    if (jaDict || jaDictLoading) return;
    jaDictLoading = true;
    try {
      const resp = await fetch(browser.runtime.getURL("vendor/ja-dict.json.gz"));
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      jaDict = await new Response(resp.body.pipeThrough(new DecompressionStream("gzip"))).json();
      LOG("jaDict loaded:", Object.keys(jaDict).length, "entries");
    } catch (e) {
      LOG("jaDict load failed:", e);
      jaDictLoading = false;
    }
  }
  function toHiragana(katakana) {
    return (katakana || "").replace(
      /[ァ-ヶ]/g,
      (ch) => String.fromCharCode(ch.charCodeAt(0) - 96)
    );
  }
  function hasKanji(text) {
    return /[一-鿿㐀-䶿]/.test(text);
  }
  function renderJapanese(text) {
    if (!kuromoji) {
      loadKuromoji();
      return escapeHtmlLang(text);
    }
    const tokens = kuromoji.tokenize(text);
    return tokens.map((token) => {
      const surface = token.surface_form;
      const baseForm = token.basic_form && token.basic_form !== "*" ? token.basic_form : surface;
      const reading = token.reading;
      const escapedSurface = escapeHtmlLang(surface);
      const escapedBase = escapeHtmlLang(baseForm);
      if (hasKanji(surface) && reading) {
        const hi = escapeHtmlLang(toHiragana(reading));
        const rtStyle = cfg.pinyinEnabled ? "" : "visibility:hidden";
        return `<span class="dusub-word" data-base="${escapedBase}"><ruby>${escapedSurface}<rt style="${rtStyle}">${hi}</rt></ruby></span>`;
      }
      return hasKanji(text) ? `<span class="dusub-word" data-base="${escapedBase}"><ruby>${escapedSurface}<rt style="${cfg.pinyinEnabled ? "" : "visibility:hidden"}"/></ruby></span>` : `<span class="dusub-word" data-base="${escapedBase}">${escapedSurface}</span>`;
    }).join("");
  }
  function escapeHtmlLang(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function pinyinTone(py) {
    if (/[āēīōūǖ]/.test(py)) return 1;
    if (/[áéíóúǘ]/.test(py)) return 2;
    if (/[ǎěǐǒǔǚ]/.test(py)) return 3;
    if (/[àèìòùǜ]/.test(py)) return 4;
    return 5;
  }
  var T3_TO_T2 = { "\u01CE": "\xE1", "\u011B": "\xE9", "\u01D0": "\xED", "\u01D2": "\xF3", "\u01D4": "\xFA", "\u01DA": "\u01D8" };
  var T1_TO_T2 = { "\u0101": "\xE1", "\u0113": "\xE9", "\u012B": "\xED", "\u014D": "\xF3", "\u016B": "\xFA", "\u01D6": "\u01D8" };
  var T1_TO_T4 = { "\u0101": "\xE0", "\u0113": "\xE8", "\u012B": "\xEC", "\u014D": "\xF2", "\u016B": "\xF9", "\u01D6": "\u01DC" };
  var T4_TO_T2 = { "\xE0": "\xE1", "\xE8": "\xE9", "\xEC": "\xED", "\xF2": "\xF3", "\xF9": "\xFA", "\u01DC": "\u01D8" };
  function tone3to2(py) {
    return py.replace(/[ǎěǐǒǔǚ]/g, (c) => T3_TO_T2[c]);
  }
  function tone1to2(py) {
    return py.replace(/[āēīōūǖ]/g, (c) => T1_TO_T2[c]);
  }
  function tone1to4(py) {
    return py.replace(/[āēīōūǖ]/g, (c) => T1_TO_T4[c]);
  }
  function tone4to2(py) {
    return py.replace(/[àèìòùǜ]/g, (c) => T4_TO_T2[c]);
  }
  function buildCorrectedPinyin(chars, pinyinArr) {
    const result = pinyinArr.slice();
    const correctedSet = /* @__PURE__ */ new Set();
    let i = 0;
    while (i < chars.length) {
      let matched = false;
      for (let len = Math.min(8, chars.length - i); len >= 2; len--) {
        const entry = hpfDict[chars.slice(i, i + len).join("")];
        if (entry) {
          const syls = entry[0].split(" ");
          if (syls.length === len) {
            for (let j = 0; j < len; j++) {
              if (result[i + j] !== syls[j]) {
                result[i + j] = syls[j];
                correctedSet.add(i + j);
              }
            }
            i += len;
            matched = true;
            break;
          }
        }
      }
      if (!matched) i++;
    }
    for (let i2 = 0; i2 < result.length - 1; i2++) {
      if (pinyinTone(result[i2]) === 3 && pinyinTone(result[i2 + 1]) === 3) {
        result[i2] = tone3to2(result[i2]);
        correctedSet.add(i2);
      }
    }
    for (let i2 = 0; i2 < chars.length; i2++) {
      if (chars[i2] === "\u4E00") {
        const nextTone = i2 + 1 < result.length ? pinyinTone(result[i2 + 1]) : 0;
        if (nextTone === 4) {
          result[i2] = tone1to2(result[i2]);
        } else if (nextTone >= 1 && nextTone <= 3) {
          result[i2] = tone1to4(result[i2]);
        } else {
          continue;
        }
        correctedSet.add(i2);
      } else if (chars[i2] === "\u4E0D" && i2 + 1 < result.length && pinyinTone(result[i2 + 1]) === 4) {
        result[i2] = tone4to2(result[i2]);
        correctedSet.add(i2);
      }
    }
    return { corrected: result, correctedSet };
  }

  // extension/src/content/render.js
  function applyStyle() {
    const scale = (cfg.fontScale || 100) / 100;
    const baseSz = 40;
    const cjkSz = Math.round(baseSz * scale);
    const defaultSz = Math.round(cjkSz * 0.8);
    const stroke = cfg.stroke ? `${defaultSz * 0.1}px #000` : "0px #000";
    const shadow = cfg.shadow ? "0px 0px 6px rgba(0,0,0,1)" : "none";
    const defaultBoxStyle = `
    font-family: Arial, sans-serif;
    line-height: 1.4;
    text-align: center;
    -webkit-text-stroke: ${stroke};
    paint-order: stroke fill;
    text-shadow: ${shadow};
  `;
    const cjkExtras = `
    font-family: sans-serif;
    letter-spacing: 0;
    line-height: normal;
    font-size: ${cjkSz}px;
  `;
    const topLang = detectLang(cfg.track1 || "");
    const bottomLang = detectLang(cfg.track2 || "");
    const isCjk = (lang) => lang === "zh" || lang === "ja";
    const topNeedsRubyPad = cfg.pinyinEnabled && (topLang === "zh" && cfg.learnMode === "zh" || topLang === "ja" && cfg.learnMode === "ja");
    const topWinBg = cfg.window ? `background:rgba(0,0,0,0.5);padding:${topNeedsRubyPad ? ".25em" : "0"} 10px 0;border-radius:3px;` : "";
    const winBg = cfg.window ? "background:rgba(0,0,0,0.5);padding:0 10px;border-radius:3px;" : "";
    topBox.style.cssText = defaultBoxStyle + topWinBg + `color: ${cfg.track1Color};` + (isCjk(topLang) ? cjkExtras : `font-size: ${defaultSz}px;`);
    bottomBox.style.cssText = defaultBoxStyle + winBg + `color: ${cfg.track2Color}; margin-top: 4px;` + (isCjk(bottomLang) ? cjkExtras : `font-size: ${defaultSz}px;`);
    root.style.display = cfg.track1 || cfg.track2 ? "" : "none";
    if (!cfg.track1 && !cfg.track2) showSiteSubs();
  }
  function readText(selector) {
    return [...document.querySelectorAll(selector)].map((el) => el.textContent.trim()).filter(Boolean).join(" ");
  }
  function setHTML(el, html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    el.replaceChildren(...doc.body.childNodes);
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderRuby(text) {
    if (!text) return "";
    const lib = (
      /** @type {any} */
      globalThis.pinyinPro
    );
    if (!lib) return escapeHtml(text);
    const chars = [...text];
    let pinyinArr = (
      /** @type {string[]} */
      lib.pinyin(text, { toneType: "symbol", type: "array" })
    );
    if (pinyinArr.length !== chars.length) return escapeHtml(text);
    const rawPinyinArr = pinyinArr.slice();
    let correctedSet = (
      /** @type {Set<number>} */
      /* @__PURE__ */ new Set()
    );
    const hpfDict2 = getHpfDict();
    if (cfg.learnMode === "zh" && cfg.pinyinEnabled && cfg.sandhiEnabled && hpfDict2) {
      ({ corrected: pinyinArr, correctedSet } = buildCorrectedPinyin(chars, pinyinArr));
    }
    let sandhiColour = cfg.track1Color;
    if (sandhiColour === "#ffffff") sandhiColour = cfg.track2Color;
    if (sandhiColour === "#ffffff") sandhiColour = "#ffe97a";
    return chars.map((char, i) => {
      const py = pinyinArr[i] || "";
      const escaped = escapeHtml(char);
      if (py && py !== char && /[一-鿿㐀-䶿豈-﫿]/.test(char)) {
        const rtColor = correctedSet.has(i) ? sandhiColour : "#fff";
        correctedSet.has(i) ? LOG(`corrected pinyin for "${char}" at idx ${i}: ${py}`) : null;
        const rtStyle = cfg.learnMode === "zh" && cfg.pinyinEnabled ? `color:${rtColor}` : "visibility:hidden";
        return `<ruby data-idx="${i}" data-py="${rawPinyinArr[i]}">${escaped}<rt style="${rtStyle}">${py}</rt></ruby>`;
      }
      return escaped;
    }).join("");
  }
  async function parseCues(slot, url) {
    try {
      const resp = await browser.runtime.sendMessage({ type: "fetch-text", url });
      if (!resp?.ok) return;
      let parsed = [];
      try {
        const data = JSON.parse(resp.text);
        if (Array.isArray(data.body)) {
          parsed = data.body.map((e) => ({
            start: e.from,
            end: e.to,
            text: (e.content || "").trim()
          })).filter((c) => c.text);
        } else {
          parsed = (data.events || []).filter((e) => e.segs).map((e) => ({
            start: e.tStartMs / 1e3,
            end: (e.tStartMs + (e.dDurationMs || 0)) / 1e3,
            text: e.segs.map((s) => s.utf8 || "").join("").trim()
          })).filter((c) => c.text);
        }
      } catch (_) {
        const doc = new DOMParser().parseFromString(resp.text, "text/xml");
        parsed = [...doc.querySelectorAll("text")].map((el) => ({
          start: parseFloat(el.getAttribute("start")),
          end: parseFloat(el.getAttribute("start")) + parseFloat(el.getAttribute("dur") || 0),
          text: el.textContent.trim()
        })).filter((c) => c.text);
      }
      if (parsed.length) {
        cues[slot] = parsed;
        LOG(`parseCues(${slot}) ${parsed.length} cues, first:`, JSON.stringify(parsed[0]));
      } else {
        LOG(`parseCues(${slot}) 0 cues, preview:`, resp.text?.slice(0, 200));
      }
    } catch (err) {
      LOG(`parseCues(${slot}) exception:`, err);
    }
  }
  function tick() {
    if (document.hidden) return;
    attachOverlay();
    applyStyle();
    const video = document.querySelector("video");
    if (overlayContainer && overlayContainer !== document.body) {
      root.style.bottom = (cfg.subPosition || 8) + "%";
    } else if (video) {
      const r = video.getBoundingClientRect();
      root.style.left = r.left + r.width / 2 + "px";
      root.style.bottom = window.innerHeight - r.bottom + r.height * (cfg.subPosition || 8) / 100 + "px";
      root.style.maxWidth = r.width * 0.9 + "px";
    }
    const t = video ? video.currentTime : -1;
    const findCue = (slot) => {
      let text = "";
      for (const c of cues[slot]) {
        if (c.start > t) break;
        if (t < c.end) text = c.text;
      }
      return text;
    };
    let top = cfg.track1 ? findCue("top") : "";
    let bottom = cfg.track2 ? findCue("bottom") : "";
    if (t > 0 && Math.floor(t) % 2 === 0 && Math.floor(t) !== renderState.lastLogTime) {
      renderState.lastLogTime = Math.floor(t);
      LOG(`t=${t.toFixed(1)}s top=${cues.top.length} bottom=${cues.bottom.length} | "${top}" / "${bottom}"`);
    }
    if (cfg.track1 && !top && !cues.top.length) top = readText(".bpx-player-subtitle-inner span, .bilibili-player-video-subtitle span");
    if (cfg.track2 && !bottom && !cues.bottom.length) bottom = readText(".bpx-player-subtitle-wrap > div:nth-child(2) .bpx-player-subtitle-inner span");
    const effectivePinyin = (cfg.learnMode === "zh" || cfg.learnMode === "ja") && cfg.pinyinEnabled;
    const showPinyinChanged = effectivePinyin !== renderState.lastShowPinyin;
    if (showPinyinChanged) renderState.lastShowPinyin = effectivePinyin;
    const effectiveSandhi = cfg.learnMode === "zh" && cfg.pinyinEnabled && cfg.sandhiEnabled;
    const toneSandhiChanged = effectiveSandhi !== renderState.lastSandhiEnabled;
    if (toneSandhiChanged) renderState.lastSandhiEnabled = effectiveSandhi;
    if (cfg.learnMode === "ja" && !getKuromoji()) loadKuromoji();
    if (cfg.learnMode === "ja") loadJaDict();
    const topLang = detectLang(cfg.track1 || "");
    const bottomLang = detectLang(cfg.track2 || "");
    if (top !== renderState.lastTop || showPinyinChanged || toneSandhiChanged) {
      renderState.lastTop = top;
      if (topLang === "zh" && cfg.learnMode === "zh") setHTML(topBox, renderRuby(top));
      else if (topLang === "ja" && cfg.learnMode === "ja") setHTML(topBox, renderJapanese(top));
      else topBox.textContent = top;
    }
    if (bottom !== renderState.lastBottom || showPinyinChanged || toneSandhiChanged) {
      renderState.lastBottom = bottom;
      if (bottomLang === "zh" && cfg.learnMode === "zh") setHTML(bottomBox, renderRuby(bottom));
      else if (bottomLang === "ja" && cfg.learnMode === "ja") setHTML(bottomBox, renderJapanese(bottom));
      else bottomBox.textContent = bottom;
    }
    topBox.style.display = top ? "" : "none";
    bottomBox.style.display = cfg.track2 && bottom ? "" : "none";
  }
  loadDict();
  setInterval(tick, 80);

  // extension/src/content/tooltip.js
  var fadeTimer = (
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    void 0
  );
  function positionTooltip(anchor) {
    const r = (anchor || topBox).getBoundingClientRect();
    const gap = 8;
    const rt = anchor && anchor.querySelector("rt");
    const rtGap = rt ? rt.getBoundingClientRect().height : 0;
    let top = r.top - tooltip.offsetHeight - gap - rtGap;
    if (top < gap) top = r.bottom + gap;
    let left = r.left + r.width / 2 - tooltip.offsetWidth / 2;
    left = Math.max(gap, Math.min(left, window.innerWidth - tooltip.offsetWidth - gap));
    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
  }
  function hideTooltip() {
    tooltip.classList.remove("hpf-tip-visible");
    const btn = tooltip.querySelector(".hpf-tip-save");
    if (btn) {
      btn.textContent = "Save word";
      btn.classList.remove("saved");
    }
  }
  function startFade() {
    fadeTimer = setTimeout(hideTooltip, 250);
  }
  function trimDefinition(en) {
    const shortDef = en.split(";").slice(0, 4).join(";");
    const stripped = shortDef.replace(/\[.*?\]\s*/g, "").replace(/\(.*?\)\s*/g, "").replace(/;{2,}/g, ";").replace(/;\s*$/, "").trim();
    if (stripped === ";") {
      const parenGroups = shortDef.match(/\(.*?\)/g) || [];
      return parenGroups.slice(0, 2).join("; ");
    }
    return stripped;
  }
  function showTooltip(result, anchor) {
    clearTimeout(fadeTimer);
    fadeTimer = void 0;
    const alreadySaved = savedZh.has(result.word);
    const wordDiv = document.createElement("div");
    wordDiv.className = "hpf-tip-word";
    wordDiv.style.color = cfg.track1Color;
    wordDiv.textContent = result.word;
    const pinyinDiv = document.createElement("div");
    pinyinDiv.className = "hpf-tip-pinyin";
    pinyinDiv.textContent = result.pinyin;
    const defsDiv = document.createElement("div");
    defsDiv.className = "hpf-tip-defs";
    defsDiv.textContent = trimDefinition(result.defs);
    const saveBtn = document.createElement("button");
    saveBtn.className = "hpf-tip-save" + (alreadySaved ? " saved" : "");
    saveBtn.textContent = alreadySaved ? "Saved \u2713" : "Save word";
    saveBtn.addEventListener("click", () => savedZh.has(result.word) ? unsaveWord(result) : saveWord(result));
    tooltip.replaceChildren(wordDiv, pinyinDiv, defsDiv, saveBtn);
    tooltip.classList.add("hpf-tip-visible");
    positionTooltip(anchor);
  }
  function saveWord(result) {
    const video = document.querySelector("video");
    const t = video ? video.currentTime - 2 : 0;
    const sep = location.href.includes("?") ? "&" : "?";
    const baseUrl = location.href.replace(/([&?])t=[^&]*/g, "").replace(/\?$/, "");
    const url = baseUrl + sep + "t=" + Math.floor(t);
    const sentField = `sent${cfg.learnMode.charAt(0).toUpperCase()}${cfg.learnMode.slice(1)}`;
    const entry = { [cfg.learnMode]: result.word, py: result.pinyin, en: trimDefinition(result.defs), [sentField]: renderState.lastTop, sentEn: renderState.lastBottom, url, language: cfg.learnMode, leitnerBox: 1, lastReviewed: null, nextReview: null };
    browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
      savedWords[result.word] = entry;
      return browser.storage.local.set({ savedWords });
    }).then(() => {
      savedZh.add(result.word);
      const btn = tooltip.querySelector(".hpf-tip-save");
      if (btn) {
        btn.textContent = "Saved \u2713";
        btn.classList.add("saved");
      }
    }).catch((err) => console.error("storage error:", err));
  }
  function unsaveWord(result) {
    browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
      delete savedWords[result.word];
      return browser.storage.local.set({ savedWords });
    }).then(() => {
      savedZh.delete(result.word);
      const btn = tooltip.querySelector(".hpf-tip-save");
      if (btn) {
        btn.textContent = "Save word";
        btn.classList.remove("saved");
      }
    }).catch((err) => console.error("storage error:", err));
  }
  function attachHover(box, trackFn, getLastText) {
    box.addEventListener("mouseover", (e) => {
      const track = trackFn();
      if (cfg.learnMode === "none" || !track || !track.startsWith(cfg.learnMode)) return;
      if (cfg.learnMode === "ja") {
        const wordSpan = (
          /** @type {Element} */
          e.target.closest(".dusub-word[data-base]")
        );
        if (!wordSpan) return;
        const jaDict2 = getJaDict();
        if (!jaDict2) {
          loadJaDict();
          return;
        }
        const base = (
          /** @type {HTMLElement} */
          wordSpan.dataset.base
        );
        const entry = jaDict2[base];
        if (!entry) return;
        const defs = entry.en.join("; ");
        const pos = entry.pos ? `[${entry.pos}] ` : "";
        const romaji = entry.rm || "";
        const reading = hasKanji(base) ? [entry.rd, romaji].filter(Boolean).join("  ") : romaji || entry.rd;
        showTooltip({ word: base, pinyin: reading, defs: pos + defs }, wordSpan);
        return;
      }
      if (!getHpfDict()) {
        loadDict();
        return;
      }
      const charEl = (
        /** @type {Element} */
        e.target.closest("[data-idx]")
      );
      if (!charEl) return;
      const idx = parseInt(
        /** @type {HTMLElement} */
        charEl.dataset.idx,
        10
      );
      const result = lookupWord(getLastText(), idx);
      if (!result) return;
      const wordLen = [...result.word].length;
      const charEls = [...box.querySelectorAll("[data-idx]")].filter((r) => {
        const ri = parseInt(
          /** @type {HTMLElement} */
          r.dataset.idx,
          10
        );
        return ri >= idx && ri < idx + wordLen;
      });
      const ctxPinyin = charEls.map((r) => (
        /** @type {HTMLElement} */
        r.dataset.py || ""
      )).join(" ").trim();
      showTooltip({ ...result, pinyin: ctxPinyin || result.pinyin }, charEl);
    });
    box.addEventListener("mouseleave", startFade);
  }
  attachHover(topBox, () => cfg.track1, () => renderState.lastTop);
  attachHover(bottomBox, () => cfg.track2, () => renderState.lastBottom);
  tooltip.addEventListener("mouseenter", () => {
    clearTimeout(fadeTimer);
    fadeTimer = void 0;
  });
  tooltip.addEventListener("mouseleave", hideTooltip);

  // extension/src/content.js
  browser.storage.local.get({ ...DEFAULTS, savedWords: {}, zhTrack: null, enTrack: null, zhColor: null, enColor: null }).then((s) => {
    const migrate = {};
    if (s.zhTrack !== null && !s.track1) {
      s.track1 = s.zhTrack;
      migrate.track1 = s.zhTrack;
    }
    if (s.enTrack !== null && !s.track2) {
      s.track2 = s.enTrack;
      migrate.track2 = s.enTrack;
    }
    if (s.zhColor !== null && s.track1Color === DEFAULTS.track1Color) {
      s.track1Color = s.zhColor;
      migrate.track1Color = s.zhColor;
    }
    if (s.enColor !== null && s.track2Color === DEFAULTS.track2Color) {
      s.track2Color = s.enColor;
      migrate.track2Color = s.enColor;
    }
    if (Object.keys(migrate).length) browser.storage.local.set(migrate);
    setCfg({ ...s, track1: DEFAULTS.track1, track2: DEFAULTS.track2 });
    LOG("cfg:", JSON.stringify(cfg));
    applyStyle();
    for (const zh of Object.keys(s.savedWords || {})) savedZh.add(zh);
    if (cfg.learnMode === "ja") {
      loadKuromoji();
      loadJaDict();
    }
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(DEFAULTS)) {
      if (key in changes) {
        if (key === "track1" || key === "track2") continue;
        patchCfg({ [key]: changes[key].newValue });
      }
    }
    if ("learnMode" in changes) {
      renderState.lastTop = "";
      renderState.lastBottom = "";
      if (changes.learnMode.newValue === "ja") {
        loadKuromoji();
        loadJaDict();
      }
    }
    applyStyle();
    if ("savedWords" in changes) {
      const oldKeys = new Set(Object.keys(changes.savedWords.oldValue || {}));
      const newKeys = new Set(Object.keys(changes.savedWords.newValue || {}));
      for (const zh of oldKeys) if (!newKeys.has(zh)) savedZh.delete(zh);
      for (const zh of newKeys) if (!oldKeys.has(zh)) savedZh.add(zh);
    }
  });
  function clearForNavigation() {
    cues.top = [];
    cues.bottom = [];
    renderState.lastTop = "";
    renderState.lastBottom = "";
    topBox.textContent = "";
    bottomBox.textContent = "";
  }
  window.addEventListener("yt-navigate-start", () => {
    clearForNavigation();
    setLastTrackUrls(null);
    if (!trackManuallySet) {
      patchCfg({ track1: "", track2: "" });
    }
  });
  window.addEventListener(CHANNEL, (e) => {
    if (document.hidden) return;
    const { type, payload } = e.detail || {};
    if (type !== "tracks") return;
    const { videoId, tracks } = payload;
    LOG("tracks from main, videoId:", videoId, "count:", tracks.length);
    clearForNavigation();
    setLocalTracks(tracks.map((t) => ({ languageCode: t.code, name: t.name })));
    browser.storage.local.set({ availableTracks: localTracks }).catch(() => {
    });
    setLastTrackUrls(Object.fromEntries(tracks.map((t) => [t.code, t.url])));
    if (!trackManuallySet) {
      const tlist = (
        /** @type {{ code: string }[]} */
        tracks
      );
      const isReal = (t) => !t.code.includes("-x-ytbasr");
      if (!cfg.track1) patchCfg({ track1: tlist.find((t) => isReal(t) && t.code.startsWith("zh"))?.code || tlist.find((t) => isReal(t) && t.code.startsWith("ja"))?.code || "" });
      if (!cfg.track2) patchCfg({ track2: tlist.find((t) => isReal(t) && t.code.startsWith("en"))?.code || "" });
    }
    fetchSubtitles(lastTrackUrls);
  });
  function fetchSubtitles(trackUrls) {
    if (!cfg.track1 && !cfg.track2) return;
    let videoId = new URLSearchParams(location.search).get("v");
    if (!videoId) {
      const m = location.pathname.match(/\/(BV\w+|av\d+)/i);
      if (m) videoId = m[1];
    }
    if (!videoId) return;
    LOG("fetchSubtitles track1:", cfg.track1, "track2:", cfg.track2);
    browser.runtime.sendMessage({
      type: "fetch-subtitles",
      videoId,
      track1: cfg.track1,
      track2: cfg.track2,
      tracks: trackUrls
    }).catch((err) => LOG("fetch-subtitles failed:", err));
  }
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "subtitle-url") {
      if (document.hidden) return;
      let slot = null;
      if (msg.lang === "top" || msg.lang === "bottom") {
        slot = msg.lang;
      } else {
        if (cfg.track1 && cfg.track1.startsWith(msg.lang)) slot = "top";
        else if (cfg.track2 && cfg.track2.startsWith(msg.lang)) slot = "bottom";
      }
      if (slot) parseCues(slot, msg.url);
    }
    if (msg.type === "get-tab-config") {
      sendResponse({ track1: cfg.track1, track2: cfg.track2, learnMode: cfg.learnMode, availableTracks: localTracks });
      return true;
    }
    if (msg.type === "set-track") {
      const t1 = msg.track1 ?? cfg.track1;
      const t2 = msg.track2 ?? cfg.track2;
      const changed = t1 !== cfg.track1 || t2 !== cfg.track2;
      patchCfg({ track1: t1, track2: t2 });
      setTrackManuallySet(true);
      if (changed) {
        cues.top = [];
        cues.bottom = [];
        renderState.lastTop = "";
        renderState.lastBottom = "";
        if (lastTrackUrls) fetchSubtitles(lastTrackUrls);
      }
      sendResponse({ ok: true });
      return true;
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      renderState.lastTop = "";
      renderState.lastBottom = "";
      topBox.textContent = "";
      bottomBox.textContent = "";
    }
    if (!document.hidden && lastTrackUrls && (cfg.track1 || cfg.track2) && !cues.top.length && !cues.bottom.length) {
      fetchSubtitles(lastTrackUrls);
    }
  });
})();
