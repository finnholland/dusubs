// @ts-check
import { browser, LOG } from '../state.js';

/** @param {string} s @returns {string} */
export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Fetches a gzipped JSON file bundled with the extension. @param {string} path */
async function fetchGzipJson(path) {
  const resp = await fetch(browser.runtime.getURL(path));
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).json();
}

/**
 * Lazily loaded gzipped JSON dictionary. `load()` is safe to call repeatedly and concurrently.
 * @template T
 * @param {string} path extension-relative path to the .json.gz file
 * @param {string} name label used in logs
 */
export function lazyDict(path, name) {
  /** @type {T | null} */
  let data = null;
  let loading = false;
  return {
    get: () => data,
    /** @returns {Promise<T | null>} */
    async load() {
      if (data || loading) return data;
      loading = true;
      try {
        data = await fetchGzipJson(path);
        LOG(`${name} loaded:`, Object.keys(data).length, 'entries');
      } catch (e) {
        LOG(`${name} load failed:`, e);
      } finally {
        loading = false;
      }
      return data;
    },
  };
}
