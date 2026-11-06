import 'server-only';
import { registerProvider, upstream } from './http';

/** Price provider (Binance Spot) and derivatives/flow provider (Binance USDⓈ-M Futures). Public endpoints, no key. */
registerProvider('binance-spot', 'Price provider', 'Binance Spot API');
registerProvider('binance-futures', 'Flow provider', 'Binance Futures API');

const SPOT = 'https://api.binance.com', FUT = 'https://fapi.binance.com';
const spotSymbol = (t: string) => `${t}USDT`;
// PEPE trades per 1,000 tokens on futures.
const futSymbol = (t: string) => (t === 'PEPE' ? '1000PEPEUSDT' : `${t}USDT`);

export interface Ticker { symbol: string; price: number; change24h: number; volume24h: number; high24h: number; low24h: number; trades24h: number }

export async function tickers(tokens: string[]): Promise<Ticker[]> {
  const list = encodeURIComponent(JSON.stringify(tokens.map(spotSymbol)));
  const rows = await upstream<Array<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; highPrice: string; lowPrice: string; count: number }>>('binance-spot', `${SPOT}/api/v3/ticker/24hr?symbols=${list}`, { ttlMs: 3_000 });
  return rows.map(r => ({ symbol: r.symbol.replace(/USDT$/, ''), price: Number(r.lastPrice), change24h: Number(r.priceChangePercent), volume24h: Number(r.quoteVolume), high24h: Number(r.highPrice), low24h: Number(r.lowPrice), trades24h: r.count }));
}

/** Closing prices, oldest first. */
export async function closes(token: string, interval: '1h' | '1d', limit: number): Promise<number[]> {
  const rows = await upstream<Array<[number, string, string, string, string]>>('binance-spot', `${SPOT}/api/v3/klines?symbol=${spotSymbol(token)}&interval=${interval}&limit=${limit}`, { ttlMs: interval === '1h' ? 120_000 : 600_000 });
  return rows.map(r => Number(r[4]));
}

export interface Flows {
  token: string;
  /** Aggressive buy minus sell volume (taker flow), in USD. */
  netTakerFlowUsd24h: number; netTakerFlowUsd7d: number; takerBuyUsd24h: number; takerSellUsd24h: number;
  openInterestUsd: number; openInterestChange24hPct: number;
  fundingRate8h: number; nextFundingAt: string;
  topTraderLongPct: number; topTraderLongShortRatio: number;
  largeTrades: Array<{ side: 'buy' | 'sell'; usd: number; price: number; size: number; at: string }>;
  largeTradeThresholdUsd: number;
}

export async function flows(token: string, price: number): Promise<Flows> {
  const s = futSymbol(token), q = (path: string, ttlMs = 60_000) => upstream<never>('binance-futures', `${FUT}${path}`, { ttlMs });
  const [taker24, taker7d, oi, premium, top, trades] = await Promise.all([
    q(`/futures/data/takerlongshortRatio?symbol=${s}&period=1h&limit=24`) as Promise<Array<{ buyVol: string; sellVol: string }>>,
    q(`/futures/data/takerlongshortRatio?symbol=${s}&period=4h&limit=42`, 600_000) as Promise<Array<{ buyVol: string; sellVol: string }>>,
    q(`/futures/data/openInterestHist?symbol=${s}&period=1h&limit=25`) as Promise<Array<{ sumOpenInterestValue: string }>>,
    q(`/fapi/v1/premiumIndex?symbol=${s}`, 30_000) as Promise<{ lastFundingRate: string; nextFundingTime: number }>,
    q(`/futures/data/topLongShortPositionRatio?symbol=${s}&period=1h&limit=1`) as Promise<Array<{ longAccount: string; longShortRatio: string }>>,
    q(`/fapi/v1/aggTrades?symbol=${s}&limit=1000`, 15_000) as Promise<Array<{ p: string; q: string; T: number; m: boolean }>>,
  ]);
  // Taker volumes are in base units; value them at the current price.
  const sum = (rows: Array<{ buyVol: string; sellVol: string }>, k: 'buyVol' | 'sellVol') => rows.reduce((t, r) => t + Number(r[k]), 0);
  const unit = token === 'PEPE' ? 1000 : 1;
  const buy24 = sum(taker24, 'buyVol') * price * unit, sell24 = sum(taker24, 'sellVol') * price * unit;
  const net7d = (sum(taker7d, 'buyVol') - sum(taker7d, 'sellVol')) * price * unit;
  const oiNow = Number(oi.at(-1)?.sumOpenInterestValue ?? 0), oiThen = Number(oi[0]?.sumOpenInterestValue ?? oiNow);
  const notional = trades.map(t => ({ side: (t.m ? 'sell' : 'buy') as 'buy' | 'sell', usd: Number(t.p) * Number(t.q), price: Number(t.p) / unit, size: Number(t.q) * unit, at: new Date(t.T).toISOString() }));
  // "Large" is relative to the market: the top end of recent trades, at least $25k.
  const sorted = [...notional].sort((a, b) => b.usd - a.usd);
  const threshold = Math.max(25_000, sorted[Math.min(19, sorted.length - 1)]?.usd ?? 0);
  return {
    token, netTakerFlowUsd24h: Math.round(buy24 - sell24), netTakerFlowUsd7d: Math.round(net7d), takerBuyUsd24h: Math.round(buy24), takerSellUsd24h: Math.round(sell24),
    openInterestUsd: Math.round(oiNow), openInterestChange24hPct: oiThen ? Number((((oiNow - oiThen) / oiThen) * 100).toFixed(2)) : 0,
    fundingRate8h: Number(premium.lastFundingRate), nextFundingAt: new Date(premium.nextFundingTime).toISOString(),
    topTraderLongPct: Number((Number(top[0]?.longAccount ?? 0.5) * 100).toFixed(1)), topTraderLongShortRatio: Number(top[0]?.longShortRatio ?? 1),
    largeTrades: sorted.filter(t => t.usd >= threshold).slice(0, 10).sort((a, b) => b.at.localeCompare(a.at)).map(t => ({ ...t, usd: Math.round(t.usd) })),
    largeTradeThresholdUsd: Math.round(threshold),
  };
}
