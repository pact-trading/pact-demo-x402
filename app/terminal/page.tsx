'use client';

import { CircleCheck, Loader2, Receipt, RefreshCw, TriangleAlert, Unlock, Wallet } from 'lucide-react';
import { DatasetIcon } from '@/components/dataset-icon';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ENDPOINTS, TOKENS, type Endpoint } from '@/lib/catalog';
import { explorer, short, usd } from '@/lib/chain';
import { loadDesk, paidFetch, reason, type Desk } from '@/lib/client/vault';

type Prices = { prices: Array<{ symbol: string; price: number; change24h: number; volume24h: number }> };
type News = { items: Array<{ id: string; headline: string; url: string; source: string; sentiment: number; impact: string; tokens: string[]; publishedAt: string }> };
type Flows = { token: string; netTakerFlowUsd24h: number; netTakerFlowUsd7d: number; openInterestUsd: number; openInterestChange24hPct: number; fundingRate8h: number; topTraderLongPct: number; largeTradeThresholdUsd: number; largeTrades: Array<{ side: 'buy' | 'sell'; usd: number; price: number; size: number; at: string }>; source: string };
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
            <div><p className="flex items-center gap-2 font-semibold"><DatasetIcon id="smart-money" /> Order flow: {token}</p><p className="text-xs text-dim">Binance Futures, live</p></div>
            <Buy id="smart-money" label={flows ? 'Refresh' : 'Unlock'} onClick={() => buy<Flows>('smart-money', `?token=${token}`, setFlows)} />
          </div>
          <div className={`mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 ${flows ? '' : 'blur-lock'}`}>
            {([
              ['Net taker flow 24h', flows ? m(flows.netTakerFlowUsd24h) : '+$24.1M', flows ? flows.netTakerFlowUsd24h >= 0 : true],
              ['Net taker flow 7d', flows ? m(flows.netTakerFlowUsd7d) : '+$80.2M', flows ? flows.netTakerFlowUsd7d >= 0 : true],
              ['Open interest 24h', flows ? `${flows.openInterestChange24hPct >= 0 ? '+' : ''}${flows.openInterestChange24hPct.toFixed(2)}%` : '+1.8%', flows ? flows.openInterestChange24hPct >= 0 : true],
              ['Top traders long', flows ? `${flows.topTraderLongPct}%` : '62.4%', flows ? flows.topTraderLongPct >= 50 : true],
            ] as const).map(([k, v, good]) => (
              <div key={k} className="rounded-md bg-ink-2 p-3"><p className="text-xs text-dim">{k}</p><p className={`num mt-1 text-lg font-semibold ${good ? 'up' : 'down'}`}>{v}</p></div>
            ))}
          </div>
          <div className={`mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-dim ${flows ? '' : 'blur-lock'}`}>
            <span>Open interest <span className="num text-fg">{flows ? (flows.openInterestUsd >= 1e9 ? `$${(flows.openInterestUsd / 1e9).toFixed(2)}B` : `$${(flows.openInterestUsd / 1e6).toFixed(0)}M`) : '$5.29B'}</span></span>
            <span>Funding per 8h <span className="num text-fg">{flows ? `${(flows.fundingRate8h * 100).toFixed(4)}%` : '0.0100%'}</span></span>
            <span>Large trade from <span className="num text-fg">{flows ? `$${(flows.largeTradeThresholdUsd / 1000).toFixed(0)}k` : '$120k'}</span></span>
          </div>
          <table className={`mt-4 w-full text-sm ${flows ? '' : 'blur-lock'}`}>
            <thead className="text-left text-xs text-dim"><tr><th className="pb-2 font-medium">Time</th><th className="pb-2 font-medium">Side</th><th className="pb-2 text-right font-medium">Price</th><th className="pb-2 text-right font-medium">Size</th><th className="pb-2 text-right font-medium">Value</th></tr></thead>
            <tbody>
              {(flows?.largeTrades ?? Array.from({ length: 5 }, (_, i) => ({ side: (i % 2 ? 'sell' : 'buy') as 'buy' | 'sell', usd: 420_000, price: 2230, size: 188, at: new Date().toISOString() }))).slice(0, 8).map((t, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="num py-2 text-dim">{new Date(t.at).toLocaleTimeString()}</td>
                  <td className={`py-2 font-medium ${t.side === 'buy' ? 'up' : 'down'}`}>{t.side === 'buy' ? 'Buy' : 'Sell'}</td>
                  <td className="num py-2 text-right">${px(t.price)}</td>
                  <td className="num py-2 text-right text-dim">{t.size.toLocaleString(undefined, { maximumFractionDigits: 2 })} {token}</td>
                  <td className="num py-2 text-right">${(t.usd / 1000).toFixed(0)}k</td>
                </tr>
              ))}
              {flows && !flows.largeTrades.length && <tr><td colSpan={5} className="py-6 text-center text-dim">No large trades in the latest 1,000.</td></tr>}
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
            <p className="mt-3 text-sm leading-relaxed text-dim">{insight?.thesis ?? 'Takers bought more than they sold over 24h and open interest is up. Funding shows leverage is not stretched.'}</p>
            <dl className="mt-4 space-y-1.5 text-sm">
              {[['7d change', insight ? `${insight.metrics.change7dPct}%` : '+4.2%'], ['Volatility', insight ? `${insight.metrics.volatilityAnnualPct}%` : '48%'], ['Top traders long', insight ? `${insight.metrics.topTraderLongPct}%` : '61%'], ['Funding (8h)', insight ? `${(insight.metrics.fundingRate8h * 100).toFixed(4)}%` : '0.0100%'], ['News sentiment', insight ? String(insight.metrics.newsSentiment) : '0.21']].map(([k, v]) => (
                <div key={k} className="flex justify-between"><dt className="text-dim">{k}</dt><dd className="num">{v}</dd></div>
              ))}
            </dl>
            <ul className="mt-4 space-y-1 text-xs text-faint">{(insight?.risks ?? ['Top trader positioning is balanced']).map(r => <li key={r} className="flex items-center gap-1.5"><TriangleAlert size={12} strokeWidth={1.75} aria-hidden /> {r}</li>)}</ul>
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
                <div className="flex-1"><a href={n.url} target="_blank" rel="noreferrer" className="text-sm hover:underline">{n.headline}</a><p className="mt-0.5 text-xs text-faint">{n.source}, {new Date(n.publishedAt).toLocaleTimeString()}, {n.impact} impact</p></div>
                {n.tokens.map(t => <button key={t} onClick={() => setToken(t)} className="chip hover:text-fg">{t}</button>)}
              </li>
            ))}
            {!news && <li className="py-8 text-center text-sm text-dim">Ten latest headlines from three newsrooms, $0.005 a load.</li>}
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
