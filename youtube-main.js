(() => {
  'use strict';

  const CHANNEL = 'hpf-main-isolated';
  const LOG = (...a) => console.log('[HPF main]', ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function transformTrackUrl(rawUrl) {
    try {
      const u = new URL(rawUrl);
      u.searchParams.set('fmt', 'json3');
      u.searchParams.set('c', location.hostname.startsWith('m.') ? 'MWEB' : 'WEB');
      return u.toString();
    } catch (_) { return rawUrl; }
  }

  function trackCode(rawUrl) {
    try {
      const p = new URL(rawUrl);
      const lang = p.searchParams.get('lang') || '';
      const kind = p.searchParams.get('kind') || '';
      return kind === 'asr' ? `${lang}-x-ytbasr` : lang;
    } catch (_) { return ''; }
  }

  function getPlayerTracks() {
    const player = document.querySelector('#movie_player');
    if (!player?.getVideoData) { LOG('no player yet'); return null; }

    const videoId = player.getVideoData()?.video_id ?? null;
    if (!videoId) { LOG('no videoId'); return null; }

    const state = player.getPlayerStateObject?.();
    LOG('playerState:', JSON.stringify(state));
    if (state?.isUnstarted) { LOG('player unstarted'); return null; }

    let captionTracks;
    try {
      // Try getAudioTrack first (DualSub's method)
      captionTracks = player.getAudioTrack?.().captionTracks;
      LOG('getAudioTrack captionTracks:', captionTracks?.length ?? 'undefined');
    } catch (err) {
      LOG('getAudioTrack threw:', err);
    }

    // Fallback: getOption('captions', 'tracklist') — another player API
    if (!captionTracks?.length) {
      try {
        captionTracks = player.getOption?.('captions', 'tracklist');
        LOG('getOption tracklist:', captionTracks?.length ?? 'undefined');
        // tracklist entries use .id not .url — normalise them
        if (captionTracks?.length && captionTracks[0].id && !captionTracks[0].url) {
          captionTracks = captionTracks.map(t => ({
            ...t,
            url: t.id,
            languageName: t.displayName || t.languageName,
          }));
        }
      } catch (err) {
        LOG('getOption threw:', err);
      }
    }

    if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
      LOG('no captionTracks available');
      return null;
    }

    LOG('raw captionTracks[0]:', JSON.stringify(captionTracks[0]).slice(0, 200));


    const tracks = captionTracks.map(t => ({
      code: trackCode(t.url),
      name: t.languageName || t.name || trackCode(t.url),
      url: transformTrackUrl(t.url),
    }));

    return { videoId, tracks };
  }

  function postToIsolated(type, payload) {
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail: { type, payload } }));
  }

  let lastVideoId = null;

  async function poll() {
    for (; ;) {
      await sleep(1000);
      try {
        const result = getPlayerTracks();
        if (!result) continue;
        if (result.videoId === lastVideoId) continue;
        lastVideoId = result.videoId;
        LOG('dispatching tracks for', result.videoId, ':', result.tracks.map(t => t.code).join(', '));
        postToIsolated('tracks', result);
      } catch (err) {
        LOG('poll error:', err);
      }
    }
  }

  window.addEventListener('yt-navigate-start', () => { lastVideoId = null; });
  poll();
})();