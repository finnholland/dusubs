import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'DuSub — Dual-Subtitle Language Learning',
  description: 'Save and review vocabulary from YouTube with dual subtitles.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#1a1a2e] text-white">
        <Header />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
