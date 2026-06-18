// @ts-check
/* global chrome */

/**
 * @typedef {{ fontScale: number, subPosition: number, track1: string, track2: string,
 *             track1Color: string, track2Color: string, stroke: boolean, window: boolean, shadow: boolean,
 *             learnMode: 'none'|'en'|'zh'|'ja', pinyinEnabled: boolean, sandhiEnabled: boolean }} Config
 * @typedef {{ start: number, end: number, text: string }} Cue
 */

export const browser = globalThis.browser ?? globalThis.chrome;

export const CHANNEL = 'hpf-main-isolated';
export const LOG = (...a) => console.log('[HPF]', ...a);

/** @type {Config} */
export const DEFAULTS = {
  fontScale: 100, subPosition: 8,
  track1: '', track2: '',
  track1Color: '#ffffff', track2Color: '#ffe97a',
  stroke: true, window: false, shadow: false,
  learnMode: 'none', pinyinEnabled: true, sandhiEnabled: true,
};

/** @type {Config} */
export let cfg = { ...DEFAULTS };
/** @param {Config} next */
export function setCfg(next) { cfg = next; }
/** @param {Partial<Config>} patch */
export function patchCfg(patch) { Object.assign(cfg, patch); }

/** @type {{ top: Cue[], bottom: Cue[] }} */
export const cues = { top: [], bottom: [] };

// Render state — primitives wrapped in object so modules share by reference
export const renderState = {
  lastTop: '',
  lastBottom: '',
  lastLogTime: -1,
  /** @type {boolean|null} */ lastShowPinyin: null,
  /** @type {boolean|null} */ lastSandhiEnabled: null,
};

/** @type {Set<string>} */
export const savedZh = new Set();

/** @type {Record<string, string> | null} */
export let lastTrackUrls = null;
/** @param {Record<string, string> | null} v */
export function setLastTrackUrls(v) { lastTrackUrls = v; }

/** @type {{ languageCode: string, name: string }[]} */
export let localTracks = [];
/** @param {{ languageCode: string, name: string }[]} v */
export function setLocalTracks(v) { localTracks = v; }

export let trackManuallySet = false;
/** @param {boolean} v */
export function setTrackManuallySet(v) { trackManuallySet = v; }
