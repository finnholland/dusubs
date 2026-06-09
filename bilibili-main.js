// @ts-check

(() => {
  'use strict';

  const CHANNEL = 'hpf-main-isolated';
  const LOG = (...a) => console.log('[HPF bili]', ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function dispatch(payload) {
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail: { type: 'tracks', payload } }));
  }

  /** Extract BV/av ID from the current URL path */
  function videoIdFromUrl() {
    const m = location.pathname.match(/\/(BV\w+|av\d+)/i);
    return m ? m[1] : null;
  }

  /** CID for the current page — needed to call the player API */
  function getCid() {
    const state = /** @type {any} */ (window).__INITIAL_STATE__;
    if (!state) return null;
    const vd = state.videoData || state.video_data;
    if (vd?.cid) return String(vd.cid);
    // episode / bangumi
    const ep = state.epInfo;
    if (ep?.cid) return String(ep.cid);
    return null;
  }

  /** Fetch subtitle list from Bilibili's player API */
  async function fetchSubtitleTracks(bvid, cid) {
    try {
      const res = await fetch(
        `https://api.bilibili.com/x/player/v2?cid=${cid}&bvid=${bvid}`,
        { credentials: 'include' }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return json?.data?.subtitle?.subtitles || [];
    } catch (e) {
      LOG('player v2 fetch failed:', e);
      return [];
    }
  }

  function normaliseUrl(url) {
    return (url || '').startsWith('//') ? 'https:' + url : url;
  }

  let lastVideoId = null;
  let lastHref = '';

  async function poll() {
    for (; ;) {
      await sleep(1000);
      try {
        const videoId = videoIdFromUrl();
        if (!videoId) continue;

        // Bilibili SPA: detect navigation via href change
        if (location.href !== lastHref) {
          lastHref = location.href;
          lastVideoId = null;
        }

        if (videoId === lastVideoId) continue;
        lastVideoId = videoId;

        // Immediately clear stale tracks from the previous site/video
        dispatch({ videoId, tracks: [] });

        // 1. Try __INITIAL_STATE__ subtitle list (fastest)
        const state = /** @type {any} */ (window).__INITIAL_STATE__;
        const vd = state?.videoData || state?.video_data;
        let rawSubs = vd?.subtitle?.list || [];

        // 2. Fallback: player API (handles AI subtitles, episodes, multi-part)
        if (!rawSubs.length) {
          const cid = getCid();
          if (cid) {
            rawSubs = await fetchSubtitleTracks(videoId, cid);
          }
        }

        if (!rawSubs.length) {
          continue;
        }

        const tracks = rawSubs.map(s => ({
          code: s.lan,
          name: s.lan_doc || s.lan,
          url: normaliseUrl(s.subtitle_url),
        }));

        dispatch({ videoId, tracks });
      } catch (e) {
        LOG('poll error:', e);
      }
    }
  }

  window.addEventListener('popstate', () => { lastVideoId = null; });
  poll();
})();
