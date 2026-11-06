import Link from 'next/link';
import { ENDPOINTS } from '@/lib/catalog';
import { explorer, short, usd } from '@/lib/chain';
import { teaser } from '@/lib/server/market';
import { listCalls } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const px = (n: number) => (n >= 1 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toPrecision(3));
const ago = (iso: string) => { const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

const QUOTES = [
  ['Our rebalancing agent buys flows for 40 tokens every hour. It costs us less than a coffee a day and there is no seat licence to argue about.', 'Mai Tran', 'Head of research, Lattice Fund'],
  ['I gave my bot a desk with a 3 USDT daily limit. If it goes wild, the contract says no. That is the whole risk policy.', 'Daniel Okafor', 'Independent quant'],
  ['We pipe the market wire straight into Claude. Pay-per-call meant we could test it in production on day one.', 'Lena Fischer', 'CTO, Kestrel Research'],
];

export default async function Home() {
  const t = await teaser();
  const activity = listCalls(undefined, 8);
  return (
    <>
      <div className="overflow-hidden border-b border-line bg-ink-1">
        <div className="ticker flex w-max gap-8 py-2.5 text-xs">
          {[...t.prices, ...t.prices].map((p, i) => (
            <span key={i} className="num flex gap-2"><span className="font-semibold text-fg">{p.symbol}</span><span className="text-dim">${px(p.price)}</span><span className={p.change24h >= 0 ? 'up' : 'down'}>{p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(2)}%</span></span>
          ))}
        </div>
      </div>

      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <span className="chip"><span className="size-1.5 rounded-full bg-mint live-dot" /> x402 live on Whitechain · settled by Pact</span>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">See what smart money does <span className="text-mint">before the chart does.</span></h1>
            <p className="mt-6 max-w-xl text-lg text-dim">Flows from 4,200 labelled funds and traders, a scored market wire and token reports. No subscription, no API key: you, or your agent, pay a fraction of a cent per call in USDT.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/desk" className="btn btn-mint !px-5 !py-3">Open a desk, get 2 test USDT</Link>
              <Link href="/developers" className="btn btn-ghost !px-5 !py-3">Read the API</Link>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              {[['18,400', 'traders'], ['1,270', 'agents paying'], ['2.1M', 'paid calls / month']].map(([n, l]) => (
                <div key={l}><dt className="num text-2xl font-semibold">{n}</dt><dd className="text-sm text-dim">{l}</dd></div>
              ))}
            </dl>
          </div>
          <div className="card overflow-hidden shadow-2xl shadow-mint/5">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-xs text-dim">
              <span className="size-2.5 rounded-full bg-rose/70" /><span className="size-2.5 rounded-full bg-amber/70" /><span className="size-2.5 rounded-full bg-mint/70" />
              <span className="num ml-2">research-agent · paying from desk</span>
            </div>
            <pre className="num overflow-x-auto p-5 text-[12.5px] leading-relaxed text-dim">
{`$ pnpm ask "Is smart money accumulating SOL?"

  `}<span className="text-mint">✓</span>{` get_prices(ETH,SOL,ARB)  paid $0.001
  `}<span className="text-mint">✓</span>{` get_smart_money(SOL)     paid $0.02
  `}<span className="text-mint">✓</span>{` get_insight(SOL)         paid $0.05

`}<span className="text-fg">{`Accumulate. Labelled wallets added $31.4M
of SOL in 24h while exchange balances fell 2.1%.
Funding is flat: spot-led, not leverage-led.`}</span>{`

— 3 paid calls, $0.071 USDT, settled by Pact`}
            </pre>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-ink-1">
        <div className="mx-auto grid max-w-7xl gap-px px-5 sm:grid-cols-3">
          {[['Pay per call, not per seat', 'Every response is one x402 payment. Buy one report or a million; no plan to pick.'], ['A desk your agent cannot drain', 'Your USDT sits in a vault you own. The session key spends within the per-call and daily limits you sign.'], ['Settled in two seconds', 'Pact verifies and settles each payment on Whitechain and pays the gas. You get a receipt per call.']].map(([h, d]) => (
            <div key={h} className="py-8 sm:px-6 first:sm:pl-0"><p className="font-semibold">{h}</p><p className="mt-2 text-sm text-dim">{d}</p></div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 pt-20 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Market wire · free preview</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">The story behind the move, scored.</h2>
          <p className="mt-3 text-dim">Headlines tagged with the tokens they move and a sentiment score. The full wire is $0.005 per load.</p>
          <Link href="/terminal" className="btn btn-ghost mt-6">Open the terminal</Link>
        </div>
        <ul className="card divide-y divide-line">
          {t.headlines.map(h => (
            <li key={h.id} className="flex items-center gap-4 px-5 py-3.5 text-sm">
              <span className="chip">{h.tokens[0]}</span>
              <span className="flex-1">{h.preview} <span className="blur-lock inline-block">market moving detail here</span></span>
              <span className={`text-xs ${h.impact === 'high' ? 'text-amber' : 'text-faint'}`}>{h.impact}</span>
              <span className="num w-16 text-right text-xs text-faint">{ago(h.publishedAt)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl scroll-mt-24 px-5 pt-24">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Pricing</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Priced per call. Paid in USDT.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ENDPOINTS.map(e => (
            <div key={e.id} className="card flex flex-col p-5">
              <p className="font-semibold">{e.name}</p>
              <p className="num mt-3 text-3xl font-semibold">{usd(e.priceMinor, 3)}<span className="text-sm font-normal text-dim"> / call</span></p>
              <p className="mt-3 flex-1 text-sm text-dim">{e.summary}</p>
              <p className="num mt-4 text-xs text-faint">GET {e.path}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 pt-24 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center justify-between"><p className="font-semibold">Paid calls, live</p><span className="chip"><span className="size-1.5 rounded-full bg-mint live-dot" /> onchain</span></div>
          <ul className="mt-4 divide-y divide-line text-sm">
            {activity.map(c => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="chip">{c.via === 'agent' ? 'agent' : c.via === 'web' ? 'trader' : 'api'}</span>
                <span className="num text-dim">{short(c.payer)}</span>
                <span className="flex-1">{c.endpoint}</span>
                <span className="num">{usd(c.priceMinor, 3)}</span>
                {c.txHash && <a href={`${explorer}/tx/${c.txHash}`} target="_blank" rel="noreferrer" className="num text-xs text-mint hover:underline">{ago(c.at)} ↗</a>}
              </li>
            ))}
            {!activity.length && <li className="py-6 text-center text-dim">Be the first paid call today.</li>}
          </ul>
        </div>
        <div className="grid gap-4">
          {QUOTES.map(([q, n, r]) => (
            <figure key={n} className="card p-5">
              <blockquote className="text-sm leading-relaxed">“{q}”</blockquote>
              <figcaption className="mt-3 text-xs text-dim"><span className="font-semibold text-fg">{n}</span> · {r}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-24">
        <div className="card flex flex-col items-start justify-between gap-6 bg-gradient-to-br from-ink-2 to-ink-1 p-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Give your agent a budget, not a credit card.</h2>
            <p className="mt-2 text-dim">Open a desk in 20 seconds. Set the limits. Hand the session key to your agent.</p>
          </div>
          <Link href="/desk" className="btn btn-mint !px-6 !py-3">Open a desk</Link>
        </div>
      </section>
    </>
  );
}
