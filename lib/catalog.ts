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
    summary: 'Live price, 24h change, range, volume and market cap for up to 20 assets in one call. From Binance Spot and CoinGecko.',
    params: [{ name: 'symbols', example: 'BTC,ETH,SOL', note: 'Comma separated, default top 10' }],
    sample: '{ "asOf": "…", "prices": [{ "symbol": "ETH", "price": 3412.18, "change24h": 2.41, "volume24h": 18200000000 }] }',
  },
  {
    id: 'news', path: '/api/v1/news', name: 'Market wire', priceMinor: '5000',
    summary: 'Latest headlines from CoinDesk, Cointelegraph and Decrypt, tagged with the tokens they mention and scored for sentiment.',
    params: [{ name: 'token', example: 'SOL', note: 'Optional filter' }, { name: 'limit', example: '10', note: 'Up to 25' }],
    sample: '{ "items": [{ "headline": "…", "sentiment": 0.62, "tokens": ["SOL"], "impact": "high" }] }',
  },
  {
    id: 'smart-money', path: '/api/v1/smart-money', name: 'Order flow', priceMinor: '20000',
    summary: 'Net taker buying and selling over 24h and 7d, open interest, funding, top trader positioning and the largest recent trades. From Binance Futures.',
    params: [{ name: 'token', example: 'ETH', note: 'Default ETH' }],
    sample: '{ "token": "ETH", "netTakerFlowUsd24h": -41200000, "openInterestChange24hPct": 1.8, "fundingRate8h": 0.0001, "topTraderLongPct": 67.2, "largeTrades": [ … ] }',
  },
  {
    id: 'insight', path: '/api/v1/insight', name: 'Token insight report', priceMinor: '50000',
    summary: 'One verdict per token from all providers: momentum, order flow, open interest, crowding, funding and news, scored 0 to 100 with the reasons.',
    params: [{ name: 'token', example: 'SOL', note: 'Required' }],
    sample: '{ "token": "SOL", "score": 74, "signal": "accumulate", "thesis": "…" }',
  },
];
export const endpointById = (id: string) => ENDPOINTS.find(e => e.id === id);
export const endpointByPath = (path: string) => ENDPOINTS.find(e => path.startsWith(e.path));
export const TOKENS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'TON', 'DOGE', 'AVAX', 'LINK', 'ARB', 'OP', 'SUI', 'PEPE', 'TIA', 'INJ', 'WIF', 'NEAR', 'APT', 'SEI', 'ENA'];
