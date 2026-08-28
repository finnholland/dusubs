'use client';

import { useState } from 'react';
import { deleteDoc, doc, collection, getDocs } from 'firebase/firestore';
import { useSyncToken, linkToken, regenerateSyncToken, isValidToken, markCurrentTokenLinked } from '../../lib/auth';
import { getDb } from '../../lib/firebase';
import { deleteAllWordsFromExtension } from '@/lib/extension';

export default function SettingsPage() {
  const { token: syncToken, linked, loading } = useSyncToken();
  const [tokenDraft, setTokenDraft] = useState('');
  // Track the last syncToken we've synced tokenDraft from, so the draft
  // picks up the generated/regenerated token exactly once per change
  // without a useEffect (React's recommended pattern for "adjust state
  // when a prop/derived value changes" — see react.dev/learn/you-might-not-need-an-effect).
  const [syncedFrom, setSyncedFrom] = useState<string | null>(null);
  if (syncToken && syncToken !== syncedFrom) {
    setSyncedFrom(syncToken);
    setTokenDraft(syncToken);
  }
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [savingToken, setSavingToken] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'local' | 'all' | null>(null);

  const copyToken = () => {
    if (!syncToken) return;
    navigator.clipboard.writeText(syncToken);
    // Copying is the moment the user takes this token to actually use it
    // (pasting into the extension) — commit to it as the linked token so
    // Dashboard/Study start reading from Firestore instead of the extension.
    markCurrentTokenLinked();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveTokenDraft = async () => {
    if (tokenDraft === syncToken) return;
    setTokenError(null);
    if (!isValidToken(tokenDraft)) {
      setTokenError('Lowercase letters and hyphens only, e.g. quiet-tiger-orbit.');
      return;
    }
    setSavingToken(true);
    try {
      await linkToken(tokenDraft);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Could not save token.');
    } finally {
      setSavingToken(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setTokenError(null);
    try {
      const fresh = await regenerateSyncToken();
      setTokenDraft(fresh);
    } finally {
      setRegenerating(false);
    }
  };

  const promptDelete = (target: 'local' | 'all') => {
    setDeleteTarget(target);
    setShowDeleteModal(true);
  };

  const confirmDeleteAllWords = async () => {
    setShowDeleteModal(false);
    deleteAllWordsFromExtension();
    if (deleteTarget === 'local' || !syncToken) return;
    setDeleting(true);
    const db = getDb();
    const snap = await getDocs(collection(db, 'users', syncToken, 'words'));
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, 'users', syncToken, 'words', d.id))));
    setDeleting(false);
  };

  if (loading) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Sync token */}
      <section className="flex flex-col gap-3">
        <h2 className="text-white/80 font-medium">Extension Sync Token</h2>
        <p className="text-white/50 text-sm">
          A token was generated automatically for this browser. Paste it into the DuSubs extension popup (or any other device) to link your saved words — anyone with this token can access them, so treat it like a password. You can also paste a different token here to link to an existing one instead.
        </p>
        {!linked && (
          <p className="text-yellow-400/80 text-xs">
            Not linked yet — copy the token below and paste it into the extension to start syncing.
          </p>
        )}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value.toLowerCase())}
            onBlur={saveTokenDraft}
            placeholder={syncToken ?? 'Generating…'}
            spellCheck={false}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono text-yellow-400"
          />
          <button
            onClick={copyToken}
            className="border border-white/20 text-white/70 px-4 py-2.5 rounded-lg text-sm hover:border-white/40 hover:text-white transition-colors shrink-0 cursor-pointer"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="border border-white/20 text-white/70 px-4 py-2.5 rounded-lg text-sm hover:border-white/40 hover:text-white transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
        {savingToken && <p className="text-white/40 text-xs">Saving…</p>}
        {tokenError && <p className="text-red-400 text-xs">{tokenError}</p>}
      </section>
      {/* Danger zone */}
      <section className="flex flex-col gap-3 border border-red-400/20 rounded-xl p-6">
        <h2 className="text-red-400 font-medium">Danger Zone</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => promptDelete('local')}
            disabled={deleting}
            className="border border-red-400/40 text-red-400 px-5 py-2 rounded-full text-sm cursor-pointer hover:bg-red-400/10 transition-colors disabled:opacity-40"
          >
            {deleting ? 'Clearing…' : 'Clear words (extension)'}
          </button>
          <button
            onClick={() => promptDelete('all')}
            disabled={deleting}
            className="border border-red-400/40 text-red-400 px-5 py-2 rounded-full text-sm cursor-pointer hover:bg-red-400/10 transition-colors disabled:opacity-40"
          >
            {deleting ? 'Clearing…' : 'Clear words (ext + cloud)'}
          </button>
        </div>
      </section>

      {/* Delete all words confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
            <h2 className="text-white font-semibold text-lg">
              {deleteTarget === 'local' ? 'Clear extension words?' : 'Clear all words?'}
            </h2>
            <p className="text-white/50 text-sm">
              {deleteTarget === 'local'
                ? 'Removes all words from the extension. Use this after you\'ve exported to Anki.'
                : 'Removes all words from the extension and your account.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="border border-white/20 text-white/70 px-4 py-2 rounded-full text-sm hover:border-white/40 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAllWords}
                className="bg-red-500/20 border border-red-400/40 text-red-400 px-4 py-2 rounded-full text-sm hover:bg-red-400/30 transition-colors cursor-pointer"
              >
                Delete all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
