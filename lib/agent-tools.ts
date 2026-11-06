import type { Endpoint } from './catalog';

/**
 * The analyst's tools. Each one is a paid Sightline endpoint: the server describes them to Claude,
 * and the browser runs them with the desk's session key, so every tool call is one x402 payment.
 */
export interface AgentTool { name: string; endpoint: Endpoint['id']; description: string; input_schema: Record<string, unknown>; query: (input: Record<string, unknown>) => string }

const token = { type: 'string', description: 'Ticker such as BTC, ETH, SOL, BNB, XRP, TON, DOGE, AVAX, LINK, ARB, OP, SUI, PEPE, TIA, INJ, WIF, NEAR, APT, SEI or ENA' };

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_prices', endpoint: 'prices',
    description: 'Live spot price, 24h change, 24h range, volume and market cap. Costs $0.001 per call; pass several symbols in one call.',
    input_schema: { type: 'object', properties: { symbols: { type: 'array', items: { type: 'string' }, description: 'Tickers' } }, required: ['symbols'], additionalProperties: false },
    query: i => `?symbols=${encodeURIComponent(((i.symbols as string[]) ?? []).join(','))}`,
  },
  {
    name: 'get_news', endpoint: 'news',
    description: 'Latest headlines from CoinDesk, Cointelegraph and Decrypt that mention the token, with sentiment (-1 to 1) and impact. Costs $0.005 per call.',
    input_schema: { type: 'object', properties: { token }, required: ['token'], additionalProperties: false },
    query: i => `?token=${encodeURIComponent(String(i.token))}&limit=6`,
  },
  {
    name: 'get_order_flow', endpoint: 'smart-money',
    description: 'Binance Futures order flow: net taker buying minus selling over 24h and 7d, open interest and its 24h change, funding rate, share of top trader accounts that are long, and the largest recent trades. Costs $0.02 per call.',
    input_schema: { type: 'object', properties: { token }, required: ['token'], additionalProperties: false },
    query: i => `?token=${encodeURIComponent(String(i.token))}`,
  },
  {
    name: 'get_insight', endpoint: 'insight',
    description: 'Full token report built from prices, order flow and news: a 0 to 100 score with its parts, a signal (accumulate, neutral, distribute), thesis, 7d change, volatility and risks. Costs $0.05 per call; use it for the tokens the user is deciding on.',
    input_schema: { type: 'object', properties: { token }, required: ['token'], additionalProperties: false },
    query: i => `?token=${encodeURIComponent(String(i.token))}`,
  },
];
export const toolByName = (name: string) => AGENT_TOOLS.find(t => t.name === name);
