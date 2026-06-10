'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useUser } from '../lib/auth';
import SignInModal from '../components/SignInModal';

function detectBrowser(): 'firefox' | 'chrome' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (ua.includes('Firefox/')) return 'firefox';
  if (ua.includes('Chrome/') || ua.includes('Chromium/')) return 'chrome';
  return 'other';
}

const STORE_URLS = {
  firefox: 'https://addons.mozilla.org/firefox/addon/dusubs/',
  chrome: 'https://chromewebstore.google.com/detail/dusubs/TODO',
};

export default function LandingPage() {
  const { user } = useUser();
  const [showSignIn, setShowSignIn] = useState(false);
  const browser = detectBrowser();
  const primaryStore = browser === 'firefox' ? 'firefox' : 'chrome';
  const secondaryStore = primaryStore === 'firefox' ? 'chrome' : 'firefox';
  const storeLabels = { firefox: 'Firefox', chrome: 'Chrome' };

  return (
    <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center text-center gap-12">
      {/* Hero */}
      <div className="flex flex-col items-center gap-6">
        <div className="text-yellow-400 text-6xl font-bold tracking-tight">DuSubs</div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-white leading-tight max-w-2xl">
          Learn languages by watching YouTube with dual subtitles
        </h1>
        <p className="text-white/60 text-lg max-w-xl">
          Save words as you watch, review them later. The extension adds Chinese,
          Japanese, and more subtitle tracks alongside your video — tap any word to save it.
        </p>
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-4">
        <a
          href={STORE_URLS[primaryStore]}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-yellow-400 text-[#1a1a2e] font-semibold px-8 py-3 rounded-full hover:bg-yellow-300 transition-colors"
        >
          Install for {storeLabels[primaryStore]}
        </a>
        {/* {user ? (
          <Link
            href="/dashboard"
            className="border border-white/20 text-white px-8 py-3 rounded-full hover:border-white/40 transition-colors"
          >
            Go to Dashboard
          </Link>
        ) : (
          <button
            onClick={() => setShowSignIn(true)}
            className="border border-white/20 text-white px-8 py-3 rounded-full hover:border-white/40 transition-colors cursor-pointer"
          >
            Sign in to sync words
          </button>
          )} */}
        <Link href="/dashboard" className="text-white/70 hover:text-white transition-colors">
          <button
            className="border border-white/20 text-white px-8 py-3 rounded-full hover:border-yellow-400 hover:text-yellow-400 transition-colors cursor-pointer"
          >
            Start studying
          </button>
        </Link>
      </div>
      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}

      {/* Feature grid */}
      <div className="grid sm:grid-cols-3 gap-6 w-full mt-4">
        {[
          {
            title: 'Dual subtitles',
            body: 'See your target language and English simultaneously — no more pausing to look things up.',
          },
          {
            title: 'One-tap save',
            body: 'Click any word in the subtitles to save it with its sentence and video timestamp.',
          },
          {
            title: 'Review anywhere',
            body: 'Your saved words sync here so you can study them as flashcards or export to Anki.',
          },
        ].map((f) => (
          <div
            key={f.title}
            className="border border-white/10 rounded-xl p-6 text-left bg-white/5"
          >
            <div className="text-yellow-400 font-semibold mb-2">{f.title}</div>
            <p className="text-white/60 text-sm leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
