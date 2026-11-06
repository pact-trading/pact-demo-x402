'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Sparkline } from './sparkline';

export interface MarketRow { symbol: string; price: number; change24h: number; volume24h: number; line: number[] }
interface Markets { asOf: string; source: string; prices: MarketRow[] }

const px = (n: number) => (n >= 1 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toPrecision(3));
const big = (n: number) => (n >= 1e12 ? `${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : `${(n / 1e6).toFixed(0)}M`);
const POLL_MS = 4000;

/** Live markets from the price provider (Binance Spot): polls Sightline's free /api/v1/markets. */
export function MarketsTable({ initial }: { initial: Markets }) {
  const [data, setData] = useState(initial);
  const [flash, setFlash] = useState<Record<string, 'up' | 'down'>>({});
  const [stale, setStale] = useState(false);
  const last = useRef(new Map(initial.prices.map(p => [p.symbol, p.price])));

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        if (document.visibilityState === 'visible') {
          const r = await fetch('/api/v1/markets', { cache: 'no-store' });
          if (!r.ok) throw new Error(String(r.status));
          const next = (await r.json()) as Markets;
          const changed: Record<string, 'up' | 'down'> = {};
          for (const p of next.prices) {
            const before = last.current.get(p.symbol);
            if (before !== undefined && p.price !== before) changed[p.symbol] = p.price > before ? 'up' : 'down';
            last.current.set(p.symbol, p.price);
          }
          setData(next); setStale(false); setFlash(changed);
          if (Object.keys(changed).length) setTimeout(() => !stop && setFlash({}), 900);
        }
      } catch { setStale(true); }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3">
        <p className="text-sm font-semibold">Markets</p>
        <p className={`flex items-center gap-1.5 text-xs ${stale ? 'text-rose' : 'text-faint'}`}>
          <RefreshCw size={12} strokeWidth={1.75} aria-hidden />
          {stale ? 'Reconnecting to Binance' : `Live from ${data.source}, updated ${new Date(data.asOf).toLocaleTimeString()}`}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-faint"><tr><th className="px-5 py-2">Asset</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">24h</th><th className="hidden py-2 text-right sm:table-cell">Volume</th><th className="px-5 py-2 text-right">24h chart</th></tr></thead>
        <tbody>
          {data.prices.map(p => (
            <tr key={p.symbol} className="border-t border-line">
              <td className="px-5 py-2.5 font-medium">{p.symbol}</td>
              <td className="num py-2.5 text-right">
                <span className={`rounded px-1 transition-colors duration-700 ${flash[p.symbol] === 'up' ? 'bg-[#E3F4EC] text-gain' : flash[p.symbol] === 'down' ? 'bg-[#FBE6E7] text-rose' : ''}`}>${px(p.price)}</span>
              </td>
              <td className={`num py-2.5 text-right ${p.change24h >= 0 ? 'up' : 'down'}`}>{p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(2)}%</td>
              <td className="num hidden py-2.5 text-right text-dim sm:table-cell">{big(p.volume24h)}</td>
              <td className="px-5 py-1.5 text-right"><span className="inline-block"><Sparkline points={p.line} change={p.change24h} /></span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-5 py-2.5 text-xs text-faint">Prices refresh every 4 seconds. Order flow, news and reports are paid per request.</p>
    </div>
  );
}
