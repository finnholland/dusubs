'use client';

import { useEffect, useState } from 'react';
import { useSyncToken, linkToken, unlinkToken, renameUsername, renamePassphrase, isValidToken, joinToken } from '../../lib/auth';
import { deleteAllWords, invalidateWordsCache } from '../../lib/words';
import { deleteAllWordsFromExtension, getExtensionSyncToken, requestSyncNow } from '@/lib/extension';

type SyncNowState = 'idle' | 'syncing' | 'synced';

export default function SettingsPage() {
  // `token` here is the bare account uuid (the real capability); `username`
  // is the unique, changeable identifier; `passphrase` is the real secret.
  // The full displayable/pasteable code is username-passphrase joined.
  const { token: uuid, username, passphrase, linked, loading } = useSyncToken();
  const fullToken = uuid && username && passphrase ? joinToken(username, passphrase) : null;

  const [tokenDraft, setTokenDraft] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [savingToken, setSavingToken] = useState(false);

  const [usernameDraft, setUsernameDraft] = useState('');
  const [renamingUsername, setRenamingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameRenameOpen, setUsernameRenameOpen] = useState(false);

  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);

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
    if (!linked || !fullToken) return;
    let cancelled = false;
    getExtensionSyncToken().then((t) => {
      if (!cancelled) setExtensionToken(t);
    });
    return () => { cancelled = true; };
  }, [linked, fullToken]);

  const canSyncNow = linked && !!uuid && extensionToken === fullToken;

  const handleSyncNow = () => {
    if (!uuid) return;
    setSyncNow('syncing');
    requestSyncNow(uuid);
    setTimeout(() => setSyncNow('synced'), 800);
    setTimeout(() => setSyncNow('idle'), 2500);
  };

  const saveTokenDraft = async () => {
    if (!tokenDraft) return;
    setTokenError(null);
    if (!isValidToken(tokenDraft)) {
      setTokenError('Expected a code like finn123-quiettiger, copied from the extension.');
      return;
    }
    setSavingToken(true);
    try {
      const { ok } = await linkToken(tokenDraft);
      if (!ok) {
        setTokenError("Code not found — check it was copied correctly, or that the extension has synced at least once.");
        return;
      }
      setTokenDraft('');
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Could not link this code.');
    } finally {
      setSavingToken(false);
    }
  };

  const handleUnlink = () => {
    unlinkToken();
    setExtensionToken(undefined);
    setSyncNow('idle');
    setUsernameRenameOpen(false);
    setRenameOpen(false);
  };

  const handleRenameUsername = async () => {
    if (!usernameDraft.trim()) return;
    setRenamingUsername(true);
    setUsernameError(null);
    try {
      await renameUsername(usernameDraft);
      setUsernameRenameOpen(false);
      setUsernameDraft('');
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : 'Could not rename.');
    } finally {
      setRenamingUsername(false);
    }
  };

  const handleRename = async () => {
    if (!renameDraft.trim()) return;
    setRenaming(true);
    setRenameError(null);
    try {
      await renamePassphrase(renameDraft);
      setRenameOpen(false);
      setRenameDraft('');
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Could not rename.');
    } finally {
      setRenaming(false);
    }
  };

  const promptDelete = (target: 'local' | 'all') => {
    setDeleteTarget(target);
    setShowDeleteModal(true);
  };

  const confirmDeleteAllWords = async () => {
    setShowDeleteModal(false);
    deleteAllWordsFromExtension();
    invalidateWordsCache();
    if (deleteTarget === 'local' || !uuid) return;
    setDeleting(true);
    await deleteAllWords(uuid);
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
          Generate a code in the DuSubs extension popup, then paste it here to link this device. It&apos;s username-passphrase — the username is unique to you, the passphrase is your real secret, so treat the whole code like a password.
        </p>

        {linked && fullToken ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono text-yellow-400">
                {fullToken}
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
            {!canSyncNow && (
              <p className="text-white/40 text-xs">
                Words will appear here once the extension picks up this code (it syncs automatically in the background).
              </p>
            )}

            {usernameRenameOpen ? (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value.toLowerCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRenameUsername(); }}
                  placeholder="new-username"
                  spellCheck={false}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono text-yellow-400 placeholder:text-white/30 placeholder:font-sans"
                />
                <button
                  onClick={handleRenameUsername}
                  disabled={renamingUsername || !usernameDraft.trim()}
                  className="border border-white/20 text-white/70 px-4 py-2.5 rounded-lg text-sm hover:border-white/40 hover:text-white transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {renamingUsername ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setUsernameRenameOpen(false); setUsernameError(null); }}
                  className="text-white/40 hover:text-white/70 text-sm px-2 cursor-pointer transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setUsernameRenameOpen(true); setUsernameDraft(username ?? ''); }}
                className="self-start text-white/40 hover:text-yellow-400 text-xs underline cursor-pointer transition-colors"
              >
                Change username
              </button>
            )}
            {usernameError && <p className="text-red-400 text-xs">{usernameError}</p>}

            {renameOpen ? (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value.toLowerCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
                  placeholder="new-passphrase"
                  spellCheck={false}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono text-yellow-400 placeholder:text-white/30 placeholder:font-sans"
                />
                <button
                  onClick={handleRename}
                  disabled={renaming || !renameDraft.trim()}
                  className="border border-white/20 text-white/70 px-4 py-2.5 rounded-lg text-sm hover:border-white/40 hover:text-white transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {renaming ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setRenameOpen(false); setRenameError(null); }}
                  className="text-white/40 hover:text-white/70 text-sm px-2 cursor-pointer transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setRenameOpen(true); setRenameDraft(passphrase ?? ''); }}
                className="self-start text-white/40 hover:text-yellow-400 text-xs underline cursor-pointer transition-colors"
              >
                Change passphrase
              </button>
            )}
            {renameError && <p className="text-red-400 text-xs">{renameError}</p>}
            <p className="text-white/30 text-xs">
              The username has to match exactly and is unique to you — the passphrase after it is your real secret, so keep it private. Either can be changed any time without losing your words.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value.toLowerCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTokenDraft(); }}
                placeholder="finn123-quiettiger — paste the code from the extension"
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
