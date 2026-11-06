'use client';

import { CircleCheck, Loader2, Receipt, RefreshCw, TriangleAlert, Unlock, Wallet } from 'lucide-react';
import { DatasetIcon } from '@/components/dataset-icon';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ENDPOINTS, TOKENS, type Endpoint } from '@/lib/catalog';
import { explorer, short, usd } from '@/lib/chain';
import { loadDesk, paidFetch, reason, type Desk } from '@/lib/client/vault';

type Prices = { prices: Array<{ symbol: string; price: number; change24h: number; volume24h: number }> };
type News = { items: Array<{ id: string; headline: string; source: string; sentiment: number; impact: string; tokens: string[]; publishedAt: string }> };
type Flows = { token: string; netFlowUsd24h: number; netFlowUsd7d: number; exchangeNetflowUsd24h: number; buyers: number; sellers: number; topWallets: Array<{ address: string; entity: string; label: string; side: string; usd: number; at: string }> };
type Insight = { token: string; score: number; signal: string; thesis: string; metrics: Record<string, number>; risks: string[]; price: { price: number; change24h: number } | null };
type Receipt = { endpoint: string; tx: string | null; price: string; at: string };

const m = (n: number) => `${n >= 0 ? '+' : '-'}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
const px = (n: number) => (n >= 1 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toPrecision(3));
const ep = (id: Endpoint['id']) => ENDPOINTS.find(e => e.id === id)!;

export default function Terminal() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('ETH');
  const [prices, setPrices] = useState<Prices | null>(null);
  const [news, setNews] = useState<News | null>(null);
  const [flows, setFlows] = useState<Flows | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  useEffect(() => { setDesk(loadDesk()); setReady(true); }, []);

  async function buy<T>(id: Endpoint['id'], query: string, set: (v: T) => void) {
    if (!desk) return;
    setBusy(id); setError('');
    try {
      const r = await paidFetch<T>(desk, `${ep(id).path}${query}`);
      set(r.data);
      setReceipts(list => [{ endpoint: ep(id).name, tx: r.txHash, price: ep(id).priceMinor, at: new Date().toISOString() }, ...list].slice(0, 12));
      window.dispatchEvent(new Event('sightline:refresh'));
    } catch (e) { setError(reason(e)); } finally { setBusy(''); }
  }

  if (!ready) return null;
  if (!desk) return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="text-3xl font-semibold">Open a desk to use the terminal</h1>
      <p className="mt-3 text-dim">The terminal buys each dataset per call from your desk. It takes 20 seconds and comes with 2 test USDT.</p>
      <Link href="/desk" className="btn btn-mint mt-6">Open a desk</Link>
    </div>
  );

  const Buy = ({ id, onClick, label }: { id: Endpoint['id']; onClick: () => void; label?: string }) => (
    <button className="btn btn-mint !px-3 !py-1.5 text-xs" disabled={!!busy} onClick={onClick}>{busy === id ? <Loader2 size={13} className="animate-spin" aria-hidden /> : label === 'Refresh' ? <RefreshCw size={13} strokeWidth={1.75} aria-hidden /> : <Unlock size={13} strokeWidth={1.75} aria-hidden />}{busy === id ? 'Paying…' : `${label ?? 'Refresh'} ${usd(ep(id).priceMinor, 3)}`}</button>
  );

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Terminal</h1>
        <div className="ml-2 flex flex-wrap gap-1">
          {TOKENS.slice(0, 12).map(t => (
            <button key={t} onClick={() => { setToken(t); setFlows(null); setInsight(null); }} className={`num rounded-lg px-2.5 py-1 text-xs font-semibold ${token === t ? 'bg-fg text-white' : 'bg-ink-2 text-dim hover:text-fg'}`}>{t}</button>
          ))}
        </div>
        <span className="chip ml-auto"><Wallet size={12} strokeWidth={1.75} aria-hidden /> Paying from {desk.label}, {short(desk.account)}</span>
      </div>
      {error && <p className="mt-4 rounded-md border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">{error}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div><p className="flex items-center gap-2 font-semibold"><DatasetIcon id="smart-money" /> Smart money: {token}</p><p className="text-xs text-dim">4,213 labelled wallets, last 24h</p></div>
            <Buy id="smart-money" label={flows ? 'Refresh' : 'Unlock'} onClick={() => buy<Flows>('smart-money', `?token=${token}`, setFlows)} />
          </div>
          <div className={`mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 ${flows ? '' : 'blur-lock'}`}>
            {[['Net flow 24h', flows ? m(flows.netFlowUsd24h) : '+$24.1M', flows ? flows.netFlowUsd24h >= 0 : true], ['Net flow 7d', flows ? m(flows.netFlowUsd7d) : '+$80.2M', flows ? flows.netFlowUsd7d >= 0 : true], ['Exchange netflow', flows ? m(flows.exchangeNetflowUsd24h) : '-$9.4M', flows ? flows.exchangeNetflowUsd24h <= 0 : true], ['Buyers / sellers', flows ? `${flows.buyers} / ${flows.sellers}` : '142 / 77', true]].map(([k, v, good]) => (
              <div key={String(k)} className="rounded-md bg-ink-2 p-3"><p className="text-xs text-dim">{k}</p><p className={`num mt-1 text-lg font-semibold ${good ? 'up' : 'down'}`}>{v}</p></div>
            ))}
          </div>
          <table className={`mt-5 w-full text-sm ${flows ? '' : 'blur-lock'}`}>
            <thead className="text-left text-xs text-dim"><tr><th className="pb-2 font-medium">Wallet</th><th className="pb-2 font-medium">Label</th><th className="pb-2 font-medium">Side</th><th className="pb-2 text-right font-medium">Size</th></tr></thead>
            <tbody>
              {(flows?.topWallets ?? Array.from({ length: 5 }, (_, i) => ({ address: `0x${'a'.repeat(40)}`, entity: 'Northwind Capital', label: 'Fund', side: i % 2 ? 'sell' : 'buy', usd: 4_200_000, at: '' }))).slice(0, 6).map((w, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-2"><p className="font-medium">{w.entity}</p><p className="num text-xs text-faint">{short(w.address)}</p></td>
                  <td className="py-2 text-dim">{w.label}</td>
                  <td className={`py-2 font-semibold ${w.side === 'buy' ? 'up' : 'down'}`}>{w.side}</td>
                  <td className="num py-2 text-right">${(w.usd / 1e6).toFixed(2)}M</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold"><DatasetIcon id="insight" /> Token report: {token}</p>
            <Buy id="insight" label={insight ? 'Refresh' : 'Unlock'} onClick={() => buy<Insight>('insight', `?token=${token}`, setInsight)} />
          </div>
          <div className={insight ? '' : 'blur-lock'}>
            <div className="mt-5 flex items-end gap-3">
              <p className="num text-5xl font-semibold">{insight?.score ?? 72}</p>
              <span className={`chip mb-2 !text-sm ${insight?.signal === 'distribute' ? '!border-rose/50 !text-rose' : insight?.signal === 'neutral' ? '!text-amber' : '!border-mint/50 !text-mint'}`}>{insight?.signal ?? 'accumulate'}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-dim">{insight?.thesis ?? 'Smart money added size while exchange balances fell. Funding is flat, so the move is spot-led rather than leverage-led.'}</p>
            <dl className="mt-4 space-y-1.5 text-sm">
              {[['Top 10 holders', insight ? `${insight.metrics.top10HolderPct}%` : '31%'], ['Funding (8h)', insight ? `${(insight.metrics.fundingRate8h * 100).toFixed(2)}%` : '0.01%'], ['Active addresses', insight ? `${insight.metrics.activeAddressesChangePct}%` : '+6%']].map(([k, v]) => (
                <div key={k} className="flex justify-between"><dt className="text-dim">{k}</dt><dd className="num">{v}</dd></div>
              ))}
            </dl>
            <ul className="mt-4 space-y-1 text-xs text-faint">{(insight?.risks ?? ['Supply broadly distributed']).map(r => <li key={r} className="flex items-center gap-1.5"><TriangleAlert size={12} strokeWidth={1.75} aria-hidden /> {r}</li>)}</ul>
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold"><DatasetIcon id="prices" /> Spot prices</p>
            <Buy id="prices" label={prices ? 'Refresh' : 'Load'} onClick={() => buy<Prices>('prices', `?symbols=${TOKENS.slice(0, 10).join(',')}`, setPrices)} />
          </div>
          <div className="mt-4 divide-y divide-line">
            {(prices?.prices ?? []).map(p => (
              <button key={p.symbol} onClick={() => setToken(p.symbol)} className="flex w-full items-center justify-between py-2 text-sm hover:bg-ink-2">
                <span className="font-semibold">{p.symbol}</span>
                <span className="num">${px(p.price)}</span>
                <span className={`num w-16 text-right ${p.change24h >= 0 ? 'up' : 'down'}`}>{p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(2)}%</span>
              </button>
            ))}
            {!prices && <p className="py-8 text-center text-sm text-dim">Live prices for 10 assets, $0.001 a load.</p>}
          </div>
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold"><DatasetIcon id="news" /> Market wire</p>
            <Buy id="news" label={news ? 'Refresh' : 'Load'} onClick={() => buy<News>('news', '?limit=10', setNews)} />
          </div>
          <ul className="mt-3 divide-y divide-line">
            {(news?.items ?? []).map(n => (
              <li key={n.id} className="flex items-start gap-3 py-3">
                <span className={`num mt-0.5 w-12 shrink-0 text-xs font-semibold ${n.sentiment >= 0 ? 'up' : 'down'}`}>{n.sentiment >= 0 ? '+' : ''}{n.sentiment.toFixed(2)}</span>
                <div className="flex-1"><p className="text-sm">{n.headline}</p><p className="mt-0.5 text-xs text-faint">{n.source}, {new Date(n.publishedAt).toLocaleTimeString()}, {n.impact} impact</p></div>
                {n.tokens.map(t => <button key={t} onClick={() => setToken(t)} className="chip hover:text-fg">{t}</button>)}
              </li>
            ))}
            {!news && <li className="py-8 text-center text-sm text-dim">Ten scored headlines, $0.005 a load.</li>}
          </ul>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <p className="flex items-center gap-2 font-semibold"><Receipt size={16} strokeWidth={1.75} aria-hidden /> Receipts this session</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {receipts.map(r => (
            <a key={r.at} href={r.tx ? `${explorer}/tx/${r.tx}` : undefined} target="_blank" rel="noreferrer" className="chip hover:text-fg">
              <CircleCheck size={13} strokeWidth={1.75} aria-hidden className="text-gain" />{r.endpoint} {usd(r.price, 3)} <span className="num">{r.tx ? short(r.tx) : 'pending'}</span>
            </a>
          ))}
          {!receipts.length && <p className="text-sm text-dim">Each purchase settles on Whitechain in about two seconds. Receipts appear here.</p>}
        </div>
      </section>
    </div>
  );
}
