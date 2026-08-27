// @ts-check
// Firebase project id used to build Firestore REST API URLs from the
// extension (which has no env var mechanism / Firebase SDK). Must match
// NEXT_PUBLIC_FIREBASE_PROJECT_ID used by the web app (web/lib/firebase.ts).
//
// TODO: fill in with the real Firebase project id before shipping.
//
// Plain (non-module) script so it works as both a Chrome service-worker
// importScripts() target and a Firefox MV2 background script — exposes its
// values on globalThis.DUSUBS_CONFIG instead of using export/import.
(function () {
  const FIREBASE_PROJECT_ID = 'sg-dusubs';
  globalThis.DUSUBS_CONFIG = {
    FIREBASE_PROJECT_ID,
    FIRESTORE_BASE_URL: `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`,
  };
})();
