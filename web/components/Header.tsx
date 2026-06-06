'use client';

import Link from 'next/link';
import { useUser, signIn, signOut } from '../lib/auth';

export default function Header() {
  const { user, loading } = useUser();

  return (
    <header className="border-b border-white/10 bg-navy-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-yellow-400 font-bold text-lg tracking-tight">
          DuSub
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          {user && (
            <>
              <Link href="/dashboard" className="text-white/70 hover:text-white transition-colors">
                Words
              </Link>
              <Link href="/study" className="text-white/70 hover:text-white transition-colors">
                Study
              </Link>
              <Link href="/settings" className="text-white/70 hover:text-white transition-colors">
                Settings
              </Link>
            </>
          )}

          {!loading && (
            user ? (
              <button
                onClick={() => signOut()}
                className="text-white/50 hover:text-white/80 transition-colors"
              >
                Sign out
              </button>
            ) : (
              <button
                onClick={() => signIn()}
                className="bg-yellow-400 text-navy px-4 py-1.5 rounded-full text-sm font-medium hover:bg-yellow-300 transition-colors"
              >
                Sign in
              </button>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
