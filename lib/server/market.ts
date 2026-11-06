import 'server-only';
import { TOKENS } from '@/lib/catalog';
import { closes, flows, tickers } from './providers/binance';
import { markets } from './providers/coingecko';
import { latestNews } from './providers/news';

/**
 * Sightline's datasets, each built from live upstream providers on every paid request:
 * prices (Binance Spot, CoinGecko for market cap and as fallback), flows (Binance Futures),
 * news (RSS) and the insight report, which combines all three.
 */
export interface Price { symbol: string; price: number; change24h: number; volume24h: number; marketCap: number | null; high24h: number | null; low24h: number | null }

export async function prices(symbols = TOKENS.slice(0, 10)): Promise<Price[]> {
  const want = symbols.map(s => s.toUpperCase()).filter(s => TOKENS.includes(s));
  const caps = await markets(want).catch(() => []);
  const cap = (s: string) => caps.find(c => c.symbol === s)?.marketCap ?? null;
  try {
    const spot = await tickers(want);
    return want.flatMap(s => { const t = spot.find(x => x.symbol === s); return t ? [{ symbol: s, price: t.price, change24h: t.change24h, volume24h: t.volume24h, marketCap: cap(s), high24h: t.high24h, low24h: t.low24h }] : []; });
  } catch {
    // Binance unavailable: serve CoinGecko's prices.
    return caps.map(c => ({ symbol: c.symbol, price: c.price, change24h: c.change24h, volume24h: c.volume24h, marketCap: c.marketCap, high24h: null, low24h: null }));
  }
}

export async function news(token?: string, limit = 10) {
  const all = await latestNews();
  const items = (token ? all.filter(i => i.tokens.includes(token.toUpperCase())) : all).slice(0, limit);
  return { asOf: new Date().toISOString(), sources: ['CoinDesk', 'Cointelegraph', 'Decrypt'], items };
}

export async function smartMoney(token = 'ETH') {
  const t = token.toUpperCase();
  const [p] = await prices([t]);
  if (!p) throw new Error(`no_price_for_${t}`);
  const f = await flows(t, p.price);
  return { ...f, asOf: new Date().toISOString(), price: p.price, source: 'Binance USDⓈ-M Futures' };
}

const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

export async function insight(token = 'SOL') {
  const t = token.toUpperCase();
  const [[p], f, wire, hourly, daily] = await Promise.all([
    prices([t]), smartMoney(t), news(t, 5), closes(t, '1h', 24), closes(t, '1d', 8),
  ]);
  const change7d = daily.length > 1 ? pct(daily.at(-1)!, daily[0]) : 0;
  const returns = hourly.slice(1).map((c, i) => Math.log(c / hourly[i]));
  const vol = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / Math.max(1, returns.length)) * Math.sqrt(24 * 365) * 100;
  const flowShare = f.takerBuyUsd24h + f.takerSellUsd24h ? f.netTakerFlowUsd24h / (f.takerBuyUsd24h + f.takerSellUsd24h) : 0;
  const sentiment = wire.items.length ? wire.items.reduce((s, i) => s + i.sentiment, 0) / wire.items.length : 0;

  // Score: spot-led buying and rising open interest push it up; crowded longs and rich funding pull it down.
  const parts = {
    flow: Math.max(-1, Math.min(1, flowShare * 10)) * 18,
    momentum: Math.max(-1, Math.min(1, (p?.change24h ?? 0) / 6)) * 10 + Math.max(-1, Math.min(1, change7d / 15)) * 8,
    openInterest: Math.max(-1, Math.min(1, f.openInterestChange24hPct / 10)) * 6,
    crowding: -Math.max(0, (f.topTraderLongPct - 60) / 20) * 8,
    funding: -Math.max(-1, Math.min(1, f.fundingRate8h / 0.0005)) * 6,
    news: sentiment * 6,
  };
  const score = Math.round(Math.max(5, Math.min(95, 50 + Object.values(parts).reduce((a, b) => a + b, 0))));
  const signal = score >= 62 ? 'accumulate' : score <= 40 ? 'distribute' : 'neutral';
  const m = (n: number) => `${n >= 0 ? '+' : '-'}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
  const thesis = signal === 'accumulate'
    ? `Takers bought ${m(f.netTakerFlowUsd24h)} more ${t} than they sold over 24h and open interest is ${f.openInterestChange24hPct >= 0 ? 'up' : 'down'} ${Math.abs(f.openInterestChange24hPct).toFixed(1)}%. Funding at ${(f.fundingRate8h * 100).toFixed(4)}% shows leverage is not stretched.`
    : signal === 'distribute'
      ? `Net taker flow in ${t} is ${m(f.netTakerFlowUsd24h)} over 24h and price is ${change7d.toFixed(1)}% over 7 days. ${f.topTraderLongPct}% of top trader accounts are long, so a flush lower would hit crowded positions.`
      : `Flows in ${t} are mixed: ${m(f.netTakerFlowUsd24h)} net taker flow, open interest ${f.openInterestChange24hPct >= 0 ? '+' : ''}${f.openInterestChange24hPct.toFixed(1)}%, top traders ${f.topTraderLongPct}% long. Wait for flow and price to agree before sizing up.`;
  const risks = [
    f.topTraderLongPct > 65 ? `Crowded long: ${f.topTraderLongPct}% of top trader accounts are long` : f.topTraderLongPct < 40 ? `Crowded short: only ${f.topTraderLongPct}% of top trader accounts are long` : 'Top trader positioning is balanced',
    Math.abs(f.fundingRate8h) > 0.0003 ? `Funding is elevated at ${(f.fundingRate8h * 100).toFixed(4)}% per 8h` : 'Funding is near neutral',
    vol > 80 ? `High volatility: ${vol.toFixed(0)}% annualised` : `Volatility ${vol.toFixed(0)}% annualised`,
  ];
  return {
    token: t, asOf: new Date().toISOString(), score, signal, thesis, price: p ?? null,
    metrics: { change24hPct: Number((p?.change24h ?? 0).toFixed(2)), change7dPct: Number(change7d.toFixed(2)), volatilityAnnualPct: Number(vol.toFixed(1)), netTakerFlowUsd24h: f.netTakerFlowUsd24h, openInterestUsd: f.openInterestUsd, openInterestChange24hPct: f.openInterestChange24hPct, fundingRate8h: f.fundingRate8h, topTraderLongPct: f.topTraderLongPct, newsSentiment: Number(sentiment.toFixed(2)) },
    scoreParts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Number(v.toFixed(1))])),
    risks, headlines: wire.items.map(i => ({ headline: i.headline, source: i.source, sentiment: i.sentiment, publishedAt: i.publishedAt, url: i.url })),
    sources: ['Binance Spot', 'Binance Futures', 'CoinGecko', 'CoinDesk, Cointelegraph, Decrypt RSS'],
  };
}

/** The free markets table on the landing page: live prices with a real 24h line (hourly closes plus the latest price). */
export async function markets24h() {
  const list = await prices(TOKENS.slice(0, 8));
  const lines = await Promise.all(list.map(p => closes(p.symbol, '1h', 24).catch(() => [] as number[])));
  return { asOf: new Date().toISOString(), source: 'Binance Spot', prices: list.map((p, i) => ({ symbol: p.symbol, price: p.price, change24h: p.change24h, volume24h: p.volume24h, line: [...lines[i].slice(0, -1), p.price] })) };
}

/** The free landing-page preview: markets and headline previews. */
export async function teaser() {
  const list = await prices(TOKENS.slice(0, 8));
  const lines = await Promise.all(list.map(p => closes(p.symbol, '1h', 24).catch(() => [] as number[])));
  const wire = await news(undefined, 6).catch(() => ({ items: [] as Awaited<ReturnType<typeof latestNews>> }));
  return {
    prices: list.map((p, i) => ({ symbol: p.symbol, price: p.price, change24h: p.change24h, volume24h: p.volume24h, line: lines[i] })),
    headlines: wire.items.map(i => ({ id: i.id, tokens: i.tokens, impact: i.impact, publishedAt: i.publishedAt, source: i.source, preview: `${i.headline.split(' ').slice(0, 5).join(' ')}…` })),
  };
}
