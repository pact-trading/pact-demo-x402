'use client';

import { ArrowUpRight } from 'lucide-react';

/** The data a paid tool call bought, shown to the user under the call. One compact view per dataset. */
type Any = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));
const px = (n: number) => (n >= 1 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toPrecision(3));
const musd = (n: number) => `${n >= 0 ? '+' : '-'}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
const pct = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
const tone = (good: boolean) => (good ? 'text-gain' : 'text-rose');

function Stat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return <div className="rounded-md bg-white px-3 py-2"><p className="text-[11px] text-faint">{label}</p><p className={`num mt-0.5 text-sm font-medium ${className}`}>{value}</p></div>;
}

function Prices({ data }: { data: Any }) {
  const rows = (data.prices as Any[]) ?? [];
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(r => (
          <tr key={String(r.symbol)} className="border-t border-line first:border-0">
            <td className="py-1.5 font-medium">{String(r.symbol)}</td>
            <td className="num py-1.5 text-right">${px(num(r.price))}</td>
            <td className={`num py-1.5 text-right ${tone(num(r.change24h) >= 0)}`}>{pct(num(r.change24h))}</td>
            <td className="num py-1.5 text-right text-dim">{r.marketCap ? `$${(num(r.marketCap) / 1e9).toFixed(1)}B cap` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function News({ data }: { data: Any }) {
  const items = ((data.items as Any[]) ?? []).slice(0, 5);
  if (!items.length) return <p className="text-sm text-dim">No recent headlines for this token.</p>;
  return (
    <ul className="space-y-2">
      {items.map(i => (
        <li key={String(i.id ?? i.headline)} className="flex gap-3 text-sm">
          <span className={`num w-11 shrink-0 text-xs ${tone(num(i.sentiment) >= 0)}`}>{num(i.sentiment) >= 0 ? '+' : ''}{num(i.sentiment).toFixed(2)}</span>
          <span className="min-w-0">
            <a href={String(i.url)} target="_blank" rel="noreferrer" className="hover:underline">{String(i.headline)}</a>
            <span className="block text-xs text-faint">{String(i.source)}, {new Date(String(i.publishedAt)).toLocaleString()}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Flow({ data }: { data: Any }) {
  const trades = ((data.largeTrades as Any[]) ?? []).slice(0, 4);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Net taker flow 24h" value={musd(num(data.netTakerFlowUsd24h))} className={tone(num(data.netTakerFlowUsd24h) >= 0)} />
        <Stat label="Net taker flow 7d" value={musd(num(data.netTakerFlowUsd7d))} className={tone(num(data.netTakerFlowUsd7d) >= 0)} />
        <Stat label="Open interest 24h" value={pct(num(data.openInterestChange24hPct))} className={tone(num(data.openInterestChange24hPct) >= 0)} />
        <Stat label="Top traders long" value={`${num(data.topTraderLongPct)}%`} />
      </div>
      {trades.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {trades.map((t, i) => (
              <tr key={i} className="border-t border-line first:border-0">
                <td className="num py-1 text-dim">{new Date(String(t.at)).toLocaleTimeString()}</td>
                <td className={`py-1 font-medium ${tone(t.side === 'buy')}`}>{t.side === 'buy' ? 'Buy' : 'Sell'}</td>
                <td className="num py-1 text-right">${px(num(t.price))}</td>
                <td className="num py-1 text-right">${(num(t.usd) / 1000).toFixed(0)}k</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Insight({ data }: { data: Any }) {
  const m = (data.metrics as Any) ?? {}, signal = String(data.signal);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="num text-3xl font-semibold">{num(data.score)}</span>
        <span className={`chip !text-xs ${signal === 'accumulate' ? '!text-gain' : signal === 'distribute' ? '!text-rose' : '!text-amber'}`}>{signal}</span>
        <span className="text-xs text-faint">score out of 100</span>
      </div>
      <p className="text-sm text-dim">{String(data.thesis)}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="7d change" value={pct(num(m.change7dPct))} className={tone(num(m.change7dPct) >= 0)} />
        <Stat label="Volatility" value={`${num(m.volatilityAnnualPct)}%`} />
        <Stat label="Funding 8h" value={`${(num(m.fundingRate8h) * 100).toFixed(4)}%`} />
        <Stat label="News sentiment" value={num(m.newsSentiment).toFixed(2)} className={tone(num(m.newsSentiment) >= 0)} />
      </div>
    </div>
  );
}

export function ToolResult({ endpoint, data, tx, explorer }: { endpoint: string; data: unknown; tx: string | null; explorer: string }) {
  const d = (data ?? {}) as Any;
  return (
    <div className="border-t border-line bg-ink-2/60 px-3 py-3">
      {endpoint === 'prices' && <Prices data={d} />}
      {endpoint === 'news' && <News data={d} />}
      {endpoint === 'smart-money' && <Flow data={d} />}
      {endpoint === 'insight' && <Insight data={d} />}
      <div className="mt-3 flex items-center justify-between text-[11px] text-faint">
        <span>{d.asOf ? `Data as of ${new Date(String(d.asOf)).toLocaleTimeString()}` : ''}</span>
        {tx && <a href={`${explorer}/tx/${tx}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-fg">View payment onchain <ArrowUpRight size={11} aria-hidden /></a>}
      </div>
    </div>
  );
}
