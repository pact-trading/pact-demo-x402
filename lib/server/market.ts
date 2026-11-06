import 'server-only';
import { TOKENS } from '@/lib/catalog';

/**
 * Sightline's datasets. Spot prices come from CoinGecko's public API (cached 30s, with a fallback);
 * news, flows and reports are generated from a seeded model so every call returns consistent data.
 */
const GECKO: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple', TON: 'the-open-network', DOGE: 'dogecoin', AVAX: 'avalanche-2',
  LINK: 'chainlink', ARB: 'arbitrum', OP: 'optimism', SUI: 'sui', PEPE: 'pepe', TIA: 'celestia', INJ: 'injective-protocol', WIF: 'dogwifcoin',
  NEAR: 'near', APT: 'aptos', SEI: 'sei-network', ENA: 'ethena',
};
const FALLBACK: Record<string, number> = { BTC: 97250, ETH: 3410, SOL: 212, BNB: 642, XRP: 2.31, TON: 5.8, DOGE: 0.38, AVAX: 41.2, LINK: 23.6, ARB: 0.94, OP: 2.1, SUI: 4.2, PEPE: 0.0000192, TIA: 6.4, INJ: 27.5, WIF: 2.6, NEAR: 6.1, APT: 11.9, SEI: 0.52, ENA: 0.98 };

export interface Price { symbol: string; price: number; change24h: number; volume24h: number; marketCap: number }
let cache: { at: number; prices: Price[] } | null = null;

/** Deterministic noise in [0,1) for a key: the same hour and token always give the same answer. */
function rand(key: string) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100_000) / 100_000;
}
const hour = () => Math.floor(Date.now() / 3_600_000);

export async function prices(symbols = TOKENS.slice(0, 10)): Promise<Price[]> {
  if (!cache || Date.now() - cache.at > 30_000) {
    try {
      const ids = Object.values(GECKO).join(',');
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as Record<string, { usd: number; usd_24h_change: number; usd_24h_vol: number; usd_market_cap: number }>;
      cache = { at: Date.now(), prices: TOKENS.flatMap(s => { const d = data[GECKO[s]]; return d ? [{ symbol: s, price: d.usd, change24h: d.usd_24h_change, volume24h: d.usd_24h_vol, marketCap: d.usd_market_cap }] : []; }) };
    } catch {
      const t = Date.now() / 60_000;
      cache = { at: Date.now(), prices: TOKENS.map(s => {
        const drift = Math.sin(t / 37 + rand(s) * 6) * 0.012 + (rand(`${s}${hour()}`) - 0.5) * 0.01;
        return { symbol: s, price: FALLBACK[s] * (1 + drift), change24h: (rand(`${s}d${hour()}`) - 0.45) * 9, volume24h: FALLBACK[s] * 4e7 * (0.5 + rand(`${s}v`)), marketCap: FALLBACK[s] * 9e8 * (0.4 + rand(`${s}m`)) };
      }) };
    }
  }
  const want = new Set(symbols.map(s => s.toUpperCase()));
  return cache.prices.filter(p => want.has(p.symbol));
}

const SOURCES = ['Sightline Wire', 'Onchain Desk', 'Derivatives Desk', 'Governance Watch', 'Macro Desk', 'Flows Desk'];
const STORIES: Array<[string, number, 'high' | 'medium' | 'low']> = [
  ['{T} spot ETF sees its largest daily inflow in three weeks', 0.71, 'high'],
  ['Market makers pull {T} liquidity from two centralised venues ahead of the weekend', -0.34, 'medium'],
  ['{T} foundation unlocks 2.1% of supply; most tokens move to custody, not exchanges', -0.18, 'medium'],
  ['Open interest in {T} perpetuals hits a 30-day high as funding turns positive', 0.42, 'high'],
  ['Whale wallets accumulate {T} for a fourth straight session', 0.58, 'high'],
  ['{T} core developers ship the upgrade that cuts fees by roughly 40%', 0.64, 'medium'],
  ['Exchange reserves of {T} fall to a multi-year low', 0.49, 'medium'],
  ['A large holder sends 18M USD of {T} to an exchange deposit address', -0.52, 'high'],
  ['Stablecoin supply on {T} grows 6% week over week', 0.37, 'low'],
  ['{T} governance vote to redirect treasury yield passes with 81% support', 0.29, 'low'],
  ['Liquidations top 120M USD as {T} wicks through key support', -0.66, 'high'],
  ['Options desks report heavy call buying in {T} for month-end expiry', 0.45, 'medium'],
  ['{T} bridge outflows spike after rival chain launches incentives', -0.27, 'low'],
  ['Funds rotate out of {T} into majors, flows data shows', -0.41, 'medium'],
];

export function news(token?: string, limit = 10) {
  const now = Date.now(), items = [];
  for (let i = 0; i < 60 && items.length < limit; i++) {
    const slot = Math.floor(now / 900_000) - i; // a new story every 15 minutes
    const t = TOKENS[Math.floor(rand(`t${slot}`) * TOKENS.length)];
    if (token && t !== token.toUpperCase()) continue;
    const [text, sentiment, impact] = STORIES[Math.floor(rand(`s${slot}`) * STORIES.length)];
    items.push({
      id: `nws_${slot.toString(36)}`, publishedAt: new Date(slot * 900_000 + rand(`m${slot}`) * 600_000).toISOString(),
      headline: text.replace('{T}', t), source: SOURCES[Math.floor(rand(`src${slot}`) * SOURCES.length)],
      tokens: [t], sentiment: Number((sentiment + (rand(`n${slot}`) - 0.5) * 0.2).toFixed(2)), impact,
    });
  }
  return { asOf: new Date().toISOString(), items };
}

const LABELS = ['Fund', 'Market maker', 'Smart trader', 'Treasury', 'Early backer', 'Arbitrage bot', 'Whale'];
const NAMES = ['Northwind Capital', 'Halcyon Digital', 'Basalt Partners', 'Orbit Liquidity', 'Kestrel Research', 'Meridian Labs', 'Cobalt Ventures', 'Tidepool Trading', 'Lattice Fund', 'Quarry Markets', 'Juniper Holdings', 'Ember Quant'];
const addr = (seed: string) => `0x${Array.from({ length: 40 }, (_, i) => '0123456789abcdef'[Math.floor(rand(`${seed}${i}`) * 16)]).join('')}`;

export async function smartMoney(token = 'ETH') {
  const t = token.toUpperCase(), h = hour();
  const [p] = await prices([t]);
  const bias = rand(`${t}bias${Math.floor(h / 6)}`) - 0.42;
  const wallets = Array.from({ length: 8 }, (_, i) => {
    const seed = `${t}${h}${i}`, side = rand(`${seed}side`) < 0.5 + bias ? 'buy' : 'sell';
    const usd = Math.round((0.4 + rand(`${seed}usd`) * 9) * 1_000_000);
    return { address: addr(seed), label: LABELS[Math.floor(rand(`${seed}l`) * LABELS.length)], entity: NAMES[Math.floor(rand(`${seed}n`) * NAMES.length)], side, usd, tokens: p ? Number((usd / p.price).toFixed(2)) : null, at: new Date(Date.now() - rand(`${seed}at`) * 86_400_000).toISOString() };
  }).sort((a, b) => b.usd - a.usd);
  const net = Math.round(bias * 90_000_000 + (rand(`${t}${h}net`) - 0.5) * 20_000_000);
  return {
    token: t, asOf: new Date().toISOString(), windowHours: 24, netFlowUsd24h: net, netFlowUsd7d: Math.round(net * (2.4 + rand(`${t}7d`) * 3)),
    exchangeNetflowUsd24h: Math.round(-net * (0.3 + rand(`${t}ex`) * 0.5)), buyers: 60 + Math.floor(rand(`${t}${h}b`) * 120), sellers: 40 + Math.floor(rand(`${t}${h}s`) * 90),
    topWallets: wallets, coverage: { labelledWallets: 4213, entities: 612 },
  };
}

export async function insight(token = 'SOL') {
  const t = token.toUpperCase();
  const [[p], flows, wire] = await Promise.all([prices([t]), smartMoney(t), Promise.resolve(news(t, 3))]);
  const flowScore = Math.max(-1, Math.min(1, flows.netFlowUsd24h / 60_000_000));
  const funding = Number(((rand(`${t}${hour()}f`) - 0.4) * 0.04).toFixed(4));
  const top10 = Number((18 + rand(`${t}top`) * 40).toFixed(1));
  const momentum = p ? Math.max(-1, Math.min(1, p.change24h / 8)) : 0;
  const score = Math.round(50 + flowScore * 22 + momentum * 14 - (top10 - 35) * 0.3 - funding * 300);
  const signal = score >= 65 ? 'accumulate' : score <= 40 ? 'distribute' : 'neutral';
  const thesis = signal === 'accumulate'
    ? `Smart money added ${(flows.netFlowUsd24h / 1e6).toFixed(1)}M USD of ${t} in 24h while exchange balances fell. Funding is ${funding > 0 ? 'positive but contained' : 'flat to negative'}, so the move is spot-led rather than leverage-led.`
    : signal === 'distribute'
      ? `Labelled wallets sold a net ${Math.abs(flows.netFlowUsd24h / 1e6).toFixed(1)}M USD of ${t} and deposits to exchanges rose. With the top 10 holders at ${top10}% of supply, a few desks can move price.`
      : `Flows into ${t} are balanced: ${flows.buyers} smart wallets bought and ${flows.sellers} sold. Wait for a break in exchange netflows before sizing up.`;
  return {
    token: t, asOf: new Date().toISOString(), score: Math.max(5, Math.min(95, score)), signal, thesis,
    price: p ?? null,
    metrics: { netFlowUsd24h: flows.netFlowUsd24h, netFlowUsd7d: flows.netFlowUsd7d, exchangeNetflowUsd24h: flows.exchangeNetflowUsd24h, top10HolderPct: top10, fundingRate8h: funding, activeAddressesChangePct: Number(((rand(`${t}aa`) - 0.4) * 30).toFixed(1)) },
    risks: [top10 > 45 ? 'Concentrated supply: top 10 holders above 45%' : 'Supply broadly distributed', funding > 0.01 ? 'Leverage building in perpetuals' : 'Leverage not stretched'],
    headlines: wire.items.map(i => ({ headline: i.headline, sentiment: i.sentiment, publishedAt: i.publishedAt })),
  };
}

/** The free, delayed teaser on the landing page: prices 15 minutes old, flows rounded and partly hidden. */
export async function teaser() {
  const list = await prices(TOKENS.slice(0, 12));
  return { delayedMinutes: 15, prices: list.map(p => ({ symbol: p.symbol, price: p.price, change24h: p.change24h })), headlines: news(undefined, 6).items.map(i => ({ id: i.id, tokens: i.tokens, impact: i.impact, publishedAt: i.publishedAt, preview: `${i.headline.split(' ').slice(0, 4).join(' ')}…` })) };
}
