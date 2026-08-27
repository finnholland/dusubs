'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
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
        <Link href="/" title='v1.0.1' className="hidden sm:block text-yellow-400 font-bold text-lg tracking-tight">
          DuSubs
        </Link>

        <nav className="flex items-center gap-24 text-sm">
          {navLink('/dashboard', 'Words')}
          {navLink('/study', 'Study')}
          {navLink('/settings', 'Settings')}
        </nav>

        <div className="hidden sm:block w-18" />
      </div>
    </header>
  );
}
