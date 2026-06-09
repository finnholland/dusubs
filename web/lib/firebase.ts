import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { Auth, getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy singletons — not initialized at module load to avoid SSR prerender errors
// when env vars are not available at build time.
let _app: FirebaseApp | undefined;
let _db: Firestore | undefined;
let _auth: Auth | undefined;
let _persistenceEnabled = false;

function getApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return _app;
}

export function getDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getApp());
    if (typeof window !== 'undefined' && !_persistenceEnabled) {
      _persistenceEnabled = true;
      enableIndexedDbPersistence(_db).catch(() => {
        // unavailable in multiple-tab or private-browsing contexts — silent fail
      });
    }
  }
  return _db;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getApp());
  }
  return _auth;
}
