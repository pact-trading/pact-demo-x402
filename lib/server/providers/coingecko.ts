import 'server-only';
import { registerProvider, upstream } from './http';

/** Market data provider: market cap and supply (CoinGecko), and the price fallback when Binance is down. */
registerProvider('coingecko', 'Market cap provider', 'CoinGecko API');

export const GECKO: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple', TON: 'the-open-network', DOGE: 'dogecoin', AVAX: 'avalanche-2',
  LINK: 'chainlink', ARB: 'arbitrum', OP: 'optimism', SUI: 'sui', PEPE: 'pepe', TIA: 'celestia', INJ: 'injective-protocol', WIF: 'dogwifcoin',
  NEAR: 'near', APT: 'aptos', SEI: 'sei-network', ENA: 'ethena',
};

export interface Market { symbol: string; price: number; change24h: number; volume24h: number; marketCap: number; rank: number | null }

export async function markets(tokens: string[]): Promise<Market[]> {
  const ids = Object.values(GECKO).join(',');
  const rows = await upstream<Array<{ id: string; current_price: number; price_change_percentage_24h: number; total_volume: number; market_cap: number; market_cap_rank: number | null }>>(
    'coingecko', `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&per_page=50`, { ttlMs: 300_000 });
  const bySymbol = new Map(Object.entries(GECKO).map(([s, id]) => [id, s]));
  return rows.flatMap(r => {
    const symbol = bySymbol.get(r.id);
    return symbol && tokens.includes(symbol) ? [{ symbol, price: r.current_price, change24h: r.price_change_percentage_24h, volume24h: r.total_volume, marketCap: r.market_cap, rank: r.market_cap_rank }] : [];
  });
}
