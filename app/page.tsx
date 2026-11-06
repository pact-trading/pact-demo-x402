import { Building2, Coins, Tags, Timer, ArrowRight, ArrowUpRight, BookOpen, Bot, Code2, FlaskConical, Monitor, Send, ShieldCheck, Wallet } from 'lucide-react';
import { DatasetIcon } from '@/components/dataset-icon';
import Link from 'next/link';
import { Sparkline } from '@/components/sparkline';
import { ENDPOINTS } from '@/lib/catalog';
import { explorer, short, usd } from '@/lib/chain';
import { teaser } from '@/lib/server/market';
import { listCalls } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const px = (n: number) => (n >= 1 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toPrecision(3));
const big = (n: number) => (n >= 1e12 ? `${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : `${(n / 1e6).toFixed(0)}M`);
const ago = (iso: string) => { const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };

const STEPS = [
  [Wallet, 'Open a desk', 'A USDT account on Whitechain that you own. Set how much it may spend per request and per day.'],
  [Send, 'Request data', 'The API answers 402 with the price. Your browser or agent signs the payment with the desk’s session key.'],
  [ShieldCheck, 'Pact settles it', 'Pact checks the payment and settles it onchain in about two seconds. You get the data and a receipt.'],
] as const;

export default async function Home() {
  const t = await teaser();
  const activity = listCalls(undefined, 8);
  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-14 lg:grid-cols-[1fr_1.1fr]">
        <div className="lg:pt-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Onchain market data, priced per request.</h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-dim">Wallet flows, a market newswire, token reports and spot prices. No subscription or API key: you, or your trading agent, pay for each request in USDT.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/desk" className="btn btn-mint">Get started <ArrowRight size={15} strokeWidth={1.75} aria-hidden /></Link>
            <Link href="/developers" className="btn btn-ghost"><BookOpen size={15} strokeWidth={1.75} aria-hidden /> API docs</Link>
          </div>
          <p className="mt-6 flex items-center gap-1.5 text-sm text-faint"><FlaskConical size={14} strokeWidth={1.75} aria-hidden /> New desks get 2 test USDT. Whitechain Sepolia testnet.</p>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
            <p className="text-sm font-semibold">Markets</p>
            <p className="text-xs text-faint">Delayed 15 min. Live data $0.001 per request.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-faint"><tr><th className="px-5 py-2">Asset</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">24h</th><th className="hidden py-2 text-right sm:table-cell">Volume</th><th className="px-5 py-2 text-right">24h chart</th></tr></thead>
            <tbody>
              {t.prices.slice(0, 8).map(p => (
                <tr key={p.symbol} className="border-t border-line">
                  <td className="px-5 py-2.5 font-medium">{p.symbol}</td>
                  <td className="num py-2.5 text-right">${px(p.price)}</td>
                  <td className={`num py-2.5 text-right ${p.change24h >= 0 ? 'up' : 'down'}`}>{p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(2)}%</td>
                  <td className="num hidden py-2.5 text-right text-dim sm:table-cell">{big(p.volume24h)}</td>
                  <td className="px-5 py-1.5 text-right"><span className="inline-block"><Sparkline seed={p.symbol} change={p.change24h} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-y border-line bg-ink-2">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-5 py-6 text-sm sm:grid-cols-4">
          {([[Tags, '4,213', 'labelled wallets tracked'], [Building2, '612', 'funds and market makers'], [Coins, '20', 'assets covered'], [Timer, '~2 s', 'to settle a payment']] as const).map(([Icon, n, l]) => (
            <div key={l} className="flex items-start gap-3"><Icon size={18} strokeWidth={1.75} className="mt-1 text-faint" aria-hidden /><div><p className="num text-xl font-medium">{n}</p><p className="text-dim">{l}</p></div></div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 px-5 pt-20">
        <h2 className="text-2xl font-semibold tracking-tight">Datasets and pricing</h2>
        <p className="mt-2 text-dim">Pay only for what you request. There is no minimum and no plan.</p>
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-faint"><tr><th className="px-5 py-3">Dataset</th><th className="py-3">What you get</th><th className="py-3">Endpoint</th><th className="px-5 py-3 text-right">Price per request</th></tr></thead>
            <tbody>
              {ENDPOINTS.map(e => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="px-5 py-4 font-medium"><span className="flex items-center gap-2.5"><span className="grid size-7 place-items-center rounded-md border border-line text-dim"><DatasetIcon id={e.id} /></span>{e.name}</span></td>
                  <td className="max-w-md py-4 pr-6 text-dim">{e.summary}</td>
                  <td className="num py-4 text-xs text-dim">GET {e.path}</td>
                  <td className="num px-5 py-4 text-right font-medium">{usd(e.priceMinor, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-20">
        <h2 className="text-2xl font-semibold tracking-tight">How payment works</h2>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
          {STEPS.map(([Icon, h, d], i) => (
            <li key={h} className="bg-white p-6">
              <div className="flex items-center justify-between"><span className="grid size-8 place-items-center rounded-md bg-ink-2 text-fg"><Icon size={16} strokeWidth={1.75} aria-hidden /></span><span className="num text-sm text-faint">0{i + 1}</span></div>
              <p className="mt-4 font-medium">{h}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-dim">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-dim">The desk’s limits are enforced by its contract, so an agent holding the session key can never spend more than you allowed. <Link href="/developers#agent" className="inline-flex items-center gap-1 text-mint hover:underline"><Bot size={14} strokeWidth={1.75} aria-hidden /> Connect an AI agent</Link></p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-20">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Recent paid requests</h2>
          <Link href="/merchant" className="inline-flex items-center gap-1 text-sm text-mint hover:underline">All activity <ArrowRight size={14} strokeWidth={1.75} aria-hidden /></Link>
        </div>
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-faint"><tr><th className="px-5 py-3">Time</th><th className="py-3">Dataset</th><th className="py-3">Client</th><th className="py-3">Desk</th><th className="py-3 text-right">Paid</th><th className="px-5 py-3 text-right">Transaction</th></tr></thead>
            <tbody>
              {activity.map(c => (
                <tr key={c.id} className="border-t border-line">
                  <td className="num px-5 py-2.5 text-dim">{ago(c.at)} ago</td>
                  <td className="py-2.5">{c.endpoint}</td>
                  <td className="py-2.5 text-dim"><span className="inline-flex items-center gap-1.5">{c.via === 'agent' ? <Bot size={14} strokeWidth={1.75} aria-hidden /> : c.via === 'web' ? <Monitor size={14} strokeWidth={1.75} aria-hidden /> : <Code2 size={14} strokeWidth={1.75} aria-hidden />}{c.via === 'agent' ? 'Agent' : c.via === 'web' ? 'Terminal' : 'API'}</span></td>
                  <td className="num py-2.5 text-dim">{short(c.payer)}</td>
                  <td className="num py-2.5 text-right">{usd(c.priceMinor, 3)}</td>
                  <td className="num px-5 py-2.5 text-right">{c.txHash && <a href={`${explorer}/tx/${c.txHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-mint hover:underline">{short(c.txHash)}<ArrowUpRight size={13} strokeWidth={1.75} aria-hidden /></a>}</td>
                </tr>
              ))}
              {!activity.length && <tr><td colSpan={6} className="px-5 py-8 text-center text-dim">No paid requests yet today.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
