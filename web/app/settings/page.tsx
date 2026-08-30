'use client';

import { useEffect, useState } from 'react';
import { useSyncToken, linkToken, unlinkToken, isValidToken } from '../../lib/auth';
import { deleteAllWords, invalidateWordsCache } from '../../lib/words';
import { deleteAllWordsFromExtension, getExtensionSyncToken, requestSyncNow } from '@/lib/extension';

type SyncNowState = 'idle' | 'syncing' | 'synced';

export default function SettingsPage() {
  const { token: syncToken, linked, loading } = useSyncToken();
  const [tokenDraft, setTokenDraft] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [savingToken, setSavingToken] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'local' | 'all' | null>(null);

  // Same-browser convenience: does the extension installed here have this
  // exact token linked too? Only then is an immediate "Sync now" safe/useful
  // — otherwise syncing happens on its own via the extension's background
  // alarm / on-change sync once it picks up the code.
  const [extensionToken, setExtensionToken] = useState<string | null | undefined>(undefined);
  const [syncNow, setSyncNow] = useState<SyncNowState>('idle');

  useEffect(() => {
    if (!linked || !syncToken) return;
    let cancelled = false;
    getExtensionSyncToken().then((t) => {
      if (!cancelled) setExtensionToken(t);
    });
    return () => { cancelled = true; };
  }, [linked, syncToken]);

  const canSyncNow = linked && !!syncToken && extensionToken === syncToken;

  const handleSyncNow = () => {
    if (!syncToken) return;
    setSyncNow('syncing');
    requestSyncNow(syncToken);
    setTimeout(() => setSyncNow('synced'), 800);
    setTimeout(() => setSyncNow('idle'), 2500);
  };

  const saveTokenDraft = async () => {
    if (!tokenDraft) return;
    setTokenError(null);
    setLinkNotice(null);
    if (!isValidToken(tokenDraft)) {
      setTokenError('Lowercase letters and hyphens only, e.g. quiet-tiger-orbit.');
      return;
    }
    setSavingToken(true);
    try {
      const { found } = await linkToken(tokenDraft);
      setLinkNotice(
        found
          ? 'Linked — found existing words for this code.'
          : "Linked — no data found yet for this code. It'll appear once the extension syncs it."
      );
      setTokenDraft('');
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Could not save token.');
    } finally {
      setSavingToken(false);
    }
  };

  const handleUnlink = () => {
    unlinkToken();
    setExtensionToken(undefined);
    setSyncNow('idle');
    setLinkNotice(null);
  };

  const promptDelete = (target: 'local' | 'all') => {
    setDeleteTarget(target);
    setShowDeleteModal(true);
  };

  const confirmDeleteAllWords = async () => {
    setShowDeleteModal(false);
    deleteAllWordsFromExtension();
    invalidateWordsCache();
    if (deleteTarget === 'local' || !syncToken) return;
    setDeleting(true);
    await deleteAllWords(syncToken);
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
          Generate a code in the DuSubs extension popup, then paste it here to link this device — anyone with this code can access your saved words, so treat it like a password.
        </p>

        {linked && syncToken ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono text-yellow-400">
                {syncToken}
              </div>
              {canSyncNow && (
                <button
                  onClick={handleSyncNow}
                  disabled={syncNow === 'syncing'}
                  className="border border-white/20 text-white/70 px-4 py-2.5 rounded-lg text-sm hover:border-white/40 hover:text-white transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {syncNow === 'syncing' ? 'Syncing…' : syncNow === 'synced' ? 'Synced' : 'Sync now'}
                </button>
              )}
              <button
                onClick={handleUnlink}
                className="border border-white/20 text-white/70 px-4 py-2.5 rounded-lg text-sm hover:border-red-400/40 hover:text-red-400 transition-colors shrink-0 cursor-pointer"
              >
                Unlink this device
              </button>
            </div>
            {linkNotice && <p className="text-white/60 text-xs">{linkNotice}</p>}
            {!canSyncNow && (
              <p className="text-white/40 text-xs">
                Words will appear here once the extension picks up this code (it syncs automatically in the background).
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value.toLowerCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTokenDraft(); }}
                placeholder="quiet-tiger-orbit — paste the code from the extension"
                spellCheck={false}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono text-yellow-400 placeholder:text-white/30 placeholder:font-sans"
              />
              <button
                onClick={saveTokenDraft}
                disabled={savingToken || !tokenDraft}
                className="border border-white/20 text-white/70 px-4 py-2.5 rounded-lg text-sm hover:border-white/40 hover:text-white transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingToken ? 'Linking…' : 'Link'}
              </button>
            </div>
            <p className="text-yellow-400/80 text-xs">
              Not linked yet — open the extension popup, hit Generate, then paste the code above.
            </p>
          </>
        )}
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
