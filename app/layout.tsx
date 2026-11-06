import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { DeskBadge } from '@/components/desk-badge';
import './globals.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Sightline: onchain market data',
  description: 'Wallet flows, market news, token reports and prices for crypto traders and their agents. Priced per request, paid in USDT.',
};

const NAV = [['Terminal', '/terminal'], ['Pricing', '/#pricing'], ['API docs', '/developers'], ['Revenue', '/merchant']] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-ink">
        <header className="sticky top-0 z-40 border-b border-line bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-5">
            <Link href="/"><Logo /></Link>
            <nav className="hidden items-center gap-6 text-sm text-dim md:flex">
              {NAV.map(([label, href]) => <Link key={href} href={href} className="hover:text-fg">{label}</Link>)}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <DeskBadge />
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-line">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 text-sm text-dim sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Logo />
              <p className="mt-3 max-w-sm">Onchain market data for traders and their agents. Each request is paid in USDT over x402 and settled by Pact on Whitechain.</p>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-fg">Product</p>
              <Link href="/terminal" className="block hover:text-fg">Terminal</Link>
              <Link href="/developers" className="block hover:text-fg">API reference</Link>
              <Link href="/desk" className="block hover:text-fg">Your desk</Link>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-fg">Payments</p>
              <a href="https://pay.pactagent.app" className="block hover:text-fg">Powered by Pact</a>
              <Link href="/merchant" className="block hover:text-fg">Revenue dashboard</Link>
              <p className="text-faint">Whitechain Sepolia testnet. Test USDT only. Spot prices from CoinGecko; other datasets are modelled.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
