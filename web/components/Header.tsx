'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser, signOut } from '../lib/auth';
import SignInModal from './SignInModal';

export default function Header() {
  const { user, loading } = useUser();
  const [showSignIn, setShowSignIn] = useState(false);
  const pathname = usePathname();

  const navLink = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        href={href}
        className={`transition-colors ${active ? 'text-yellow-400 underline underline-offset-4' : 'text-white/70 hover:text-white'}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="bg-black/20 backdrop-blur sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" title='v1.0' className="hidden sm:block text-yellow-400 font-bold text-lg tracking-tight">
          DuSubs
        </Link>

        <nav className="flex items-center gap-24 text-sm">
          {navLink('/dashboard', 'Words')}
          {navLink('/study', 'Study')}
          {navLink('/settings', 'Settings')}
          {!loading && user && (
            <button
              onClick={() => signOut()}
              className="text-white/50 hover:text-white/80 transition-colors cursor-pointer"
            >
              Sign out
            </button>
          )}
        </nav>

        <div className="hidden sm:block w-18" />
      </div>
      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
    </header>
  );
}
