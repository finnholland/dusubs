'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SignInModal({ onClose }: { onClose: () => void }) {
const [mounted] = useState(() => typeof window !== 'undefined');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-navy border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-4xl mb-4">🚧</div>
        <h2 className="text-white text-xl font-semibold mb-2">Coming soon</h2>
        <p className="text-white/50 text-sm mb-6">
          Accounts aren&apos;t available yet — you can use DuSubs without signing in for now.
        </p>
        <button
          onClick={onClose}
          className="bg-yellow-400 text-navy px-6 py-2 rounded-full text-sm font-medium hover:bg-yellow-300 transition-colors cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
