import type { Metadata } from 'next';
import { Orbitron, Share_Tech_Mono } from 'next/font/google';
import './globals.css';

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: ['400', '500', '600', '700', '800', '900'],
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  variable: '--font-hud',
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Parry Protocol - Delta-Neutral LP Protection',
  description: 'First delta-neutral impermanent loss protection protocol on X Layer. Powered by OnchainOS + Uniswap V3.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${orbitron.variable} ${shareTechMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
