/** Sightline's paid API. Every call is one x402 payment in USDT, settled by Pact on Whitechain. */
export interface Endpoint {
  id: 'prices' | 'news' | 'smart-money' | 'insight';
  path: string;
  name: string;
  priceMinor: string;
  summary: string;
  params: Array<{ name: string; example: string; note: string }>;
  sample: string;
}

export const ENDPOINTS: Endpoint[] = [
  {
    id: 'prices', path: '/api/v1/prices', name: 'Spot prices', priceMinor: '1000',
    summary: 'Real-time price, 24h change and volume for up to 20 assets in one call.',
    params: [{ name: 'symbols', example: 'BTC,ETH,SOL', note: 'Comma separated, default top 10' }],
    sample: '{ "asOf": "…", "prices": [{ "symbol": "ETH", "price": 3412.18, "change24h": 2.41, "volume24h": 18200000000 }] }',
  },
  {
    id: 'news', path: '/api/v1/news', name: 'Market wire', priceMinor: '5000',
    summary: 'Headlines scored for sentiment and tagged with the tokens they move, newest first.',
    params: [{ name: 'token', example: 'SOL', note: 'Optional filter' }, { name: 'limit', example: '10', note: 'Up to 25' }],
    sample: '{ "items": [{ "headline": "…", "sentiment": 0.62, "tokens": ["SOL"], "impact": "high" }] }',
  },
  {
    id: 'smart-money', path: '/api/v1/smart-money', name: 'Smart money flows', priceMinor: '20000',
    summary: 'Net flows from 4,200 labelled funds, market makers and top traders over 24h, with the largest wallets.',
    params: [{ name: 'token', example: 'ETH', note: 'Default ETH' }],
    sample: '{ "token": "ETH", "netFlowUsd24h": 41200000, "buyers": 128, "sellers": 74, "topWallets": [ … ] }',
  },
  {
    id: 'insight', path: '/api/v1/insight', name: 'Token insight report', priceMinor: '50000',
    summary: 'One verdict per token: price, flows, holder concentration, funding and narrative, scored 0–100.',
    params: [{ name: 'token', example: 'SOL', note: 'Required' }],
    sample: '{ "token": "SOL", "score": 74, "signal": "accumulate", "thesis": "…" }',
  },
];
export const endpointById = (id: string) => ENDPOINTS.find(e => e.id === id);
export const endpointByPath = (path: string) => ENDPOINTS.find(e => path.startsWith(e.path));
export const TOKENS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'TON', 'DOGE', 'AVAX', 'LINK', 'ARB', 'OP', 'SUI', 'PEPE', 'TIA', 'INJ', 'WIF', 'NEAR', 'APT', 'SEI', 'ENA'];
