import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { DeskBadge } from '@/components/desk-badge';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face', display: 'swap' });

export const metadata: Metadata = {
  title: 'Sightline | Onchain market intelligence, pay per call',
  description: 'Smart money flows, market wire, token reports and prices. No subscription: your agent pays per call in USDT over x402.',
};

const NAV = [['Terminal', '/terminal'], ['API', '/developers'], ['Agents', '/developers#agent'], ['Pricing', '/#pricing']] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-ink">
        <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-5">
            <Link href="/"><Logo /></Link>
            <nav className="hidden items-center gap-6 text-sm text-dim md:flex">
              {NAV.map(([label, href]) => <Link key={href} href={href} className="hover:text-fg">{label}</Link>)}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <Link href="/merchant" className="hidden text-sm text-dim hover:text-fg sm:block">Revenue</Link>
              <DeskBadge />
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-line">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 text-sm text-dim sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Logo />
              <p className="mt-3 max-w-sm">Onchain market intelligence for traders and the agents that work for them. Every call is paid in USDT over x402, settled by Pact on Whitechain.</p>
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
