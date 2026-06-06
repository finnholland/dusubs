'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteDoc, doc, collection, getDocs } from 'firebase/firestore';
import { useUser, signOut, getSyncToken } from '../../lib/auth';
import { getDb } from '../../lib/firebase';

export default function SettingsPage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [syncToken, setSyncToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) getSyncToken(user.uid).then(setSyncToken);
  }, [user]);

  const copyToken = () => {
    if (!syncToken) return;
    navigator.clipboard.writeText(syncToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteAllWords = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      'Delete all saved words? This cannot be undone.'
    );
    if (!confirmed) return;
    setDeleting(true);
    const db = getDb();
    const snap = await getDocs(collection(db, 'users', user.uid, 'words'));
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, 'users', user.uid, 'words', d.id))));
    setDeleting(false);
    alert('All words deleted.');
  };

  const deleteAccount = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      'Delete your account and all data? This cannot be undone.'
    );
    if (!confirmed) return;
    await deleteAllWords();
    const db = getDb();
    await deleteDoc(doc(db, 'users', user.uid, 'meta', 'syncToken'));
    await user.delete();
    router.replace('/');
  };

  if (loading || !user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Sync token */}
      <section className="flex flex-col gap-3">
        <h2 className="text-white/80 font-medium">Extension Sync Token</h2>
        <p className="text-white/50 text-sm">
          Paste this token into the DuSub extension popup to link your browser to this account.
        </p>
        <div className="flex items-center gap-3">
          <code className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-yellow-400 text-sm font-mono break-all">
            {syncToken ?? 'Generating…'}
          </code>
          <button
            onClick={copyToken}
            className="border border-white/20 text-white/70 px-4 py-2.5 rounded-lg text-sm hover:border-white/40 hover:text-white transition-colors shrink-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </section>

      {/* Account */}
      <section className="flex flex-col gap-3">
        <h2 className="text-white/80 font-medium">Account</h2>
        <p className="text-white/50 text-sm">Signed in as {user.email}</p>
        <button
          onClick={() => signOut().then(() => router.replace('/'))}
          className="self-start border border-white/20 text-white/70 px-5 py-2 rounded-full text-sm hover:border-white/40 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </section>

      {/* Danger zone */}
      <section className="flex flex-col gap-3 border border-red-400/20 rounded-xl p-6">
        <h2 className="text-red-400 font-medium">Danger Zone</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={deleteAllWords}
            disabled={deleting}
            className="border border-red-400/40 text-red-400 px-5 py-2 rounded-full text-sm hover:bg-red-400/10 transition-colors disabled:opacity-40"
          >
            Delete all words
          </button>
          <button
            onClick={deleteAccount}
            className="border border-red-400/40 text-red-400 px-5 py-2 rounded-full text-sm hover:bg-red-400/10 transition-colors"
          >
            Delete account
          </button>
        </div>
      </section>
    </div>
  );
}
