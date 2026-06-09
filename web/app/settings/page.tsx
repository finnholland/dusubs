'use client';

import { useEffect, useState } from 'react';
import { deleteDoc, doc, collection, getDocs } from 'firebase/firestore';
import { useUser, getSyncToken } from '../../lib/auth';
import { getDb } from '../../lib/firebase';
import { deleteAllWordsFromExtension } from '@/lib/extension';

export default function SettingsPage() {
  const { user, loading } = useUser();
  const [syncToken, setSyncToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'local' | 'all' | null>(null);

  useEffect(() => {
    if (user) getSyncToken(user.uid).then(setSyncToken);
  }, [user]);

  const copyToken = () => {
    if (!syncToken) return;
    navigator.clipboard.writeText(syncToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const promptDelete = (target: 'local' | 'all') => {
    setDeleteTarget(target);
    setShowDeleteModal(true);
  };

  const confirmDeleteAllWords = async () => {
    setShowDeleteModal(false);
    deleteAllWordsFromExtension();
    if (deleteTarget === 'local' || !user) return;
    setDeleting(true);
    const db = getDb();
    const snap = await getDocs(collection(db, 'users', user.uid, 'words'));
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, 'users', user.uid, 'words', d.id))));
    setDeleting(false);
  };

  const deleteAccount = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      'Delete your account and all data? This cannot be undone.'
    );
    if (!confirmed) return;
    const db = getDb();
    await deleteDoc(doc(db, 'users', user.uid, 'meta', 'syncToken'));
    await user.delete();
  };

  if (loading) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Sync token */}
      <section className={`flex flex-col gap-3 transition-opacity ${!user ? 'opacity-40 pointer-events-none select-none' : ''}`}>
        <h2 className="text-white/80 font-medium">Extension Sync Token</h2>
        <p className="text-white/50 text-sm">
          {user
            ? 'Paste this token into the DuSubs extension popup to link your browser to this account.'
            : 'Sign in to get a sync token and link the extension to your account.'}
        </p>
        <div className="flex items-center gap-3">
          <code className={`flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono break-all ${user ? 'text-yellow-400' : 'text-white/30 italic'}`}>
            {user ? syncToken ?? 'Generating…' : 'Sign in to generate'}
          </code>
          <button
            onClick={copyToken}
            disabled={!user}
            className="border border-white/20 text-white/70 px-4 py-2.5 rounded-lg text-sm hover:border-white/40 hover:text-white transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
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
          <div className={`${!user ? 'opacity-40 pointer-events-none select-none flex flex-col sm:flex-row gap-3' : ''}`}>
            <button
              onClick={() => promptDelete('all')}
              disabled={deleting}
              className="border border-red-400/40 text-red-400 px-5 py-2 rounded-full text-sm cursor-pointer hover:bg-red-400/10 transition-colors disabled:opacity-40"
            >
              {deleting ? 'Clearing…' : 'Clear words (ext + cloud)'}
            </button>
            <button
              onClick={deleteAccount}
              className="border border-red-400/40 text-red-400 px-5 py-2 rounded-full text-sm cursor-pointer hover:bg-red-400/10 transition-colors"
            >
              Delete account
            </button>
          </div>
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
