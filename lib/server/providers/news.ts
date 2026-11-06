import 'server-only';
import { createHash } from 'node:crypto';
import { registerProvider, upstream } from './http';

/** News provider: public RSS feeds, tagged with the tokens they mention and scored for sentiment. */
registerProvider('news', 'News provider', 'CoinDesk, Cointelegraph and Decrypt RSS');

const FEEDS = [
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { source: 'Decrypt', url: 'https://decrypt.co/feed' },
];
const NAMES: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'], ETH: ['ethereum', 'ether', 'eth'], SOL: ['solana', 'sol'], BNB: ['bnb', 'binance coin'], XRP: ['xrp', 'ripple'],
  TON: ['toncoin', 'ton'], DOGE: ['dogecoin', 'doge'], AVAX: ['avalanche', 'avax'], LINK: ['chainlink', 'link'], ARB: ['arbitrum', 'arb'],
  OP: ['optimism'], SUI: ['sui'], PEPE: ['pepe'], TIA: ['celestia', 'tia'], INJ: ['injective', 'inj'], WIF: ['dogwifhat', 'wif'],
  NEAR: ['near protocol', 'near'], APT: ['aptos', 'apt'], SEI: ['sei'], ENA: ['ethena', 'ena'],
};
const POSITIVE = ['surge', 'surges', 'soar', 'rally', 'rallies', 'gain', 'gains', 'jump', 'record', 'high', 'inflow', 'inflows', 'approve', 'approval', 'launch', 'bull', 'bullish', 'adopt', 'upgrade', 'partnership', 'rebound', 'climb', 'buy', 'accumulate', 'breakout'];
const NEGATIVE = ['drop', 'drops', 'fall', 'falls', 'plunge', 'crash', 'slump', 'outflow', 'outflows', 'hack', 'exploit', 'lawsuit', 'sue', 'ban', 'bear', 'bearish', 'liquidation', 'liquidations', 'sell-off', 'selloff', 'fraud', 'probe', 'decline', 'loss', 'losses', 'warning', 'risk', 'delay'];
const HIGH_IMPACT = ['etf', 'sec', 'fed', 'hack', 'exploit', 'liquidation', 'record', 'approval', 'ban', 'lawsuit', 'billion'];

export interface NewsItem { id: string; headline: string; summary: string; url: string; source: string; publishedAt: string; tokens: string[]; sentiment: number; impact: 'high' | 'medium' | 'low' }

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;/g, '’').replace(/&#8216;/g, '‘').replace(/&#822[01];/g, '"').replace(/&#8211;/g, '–').replace(/&#8212;/g, ', ').replace(/\s*[—·•]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '');

function score(text: string) {
  const words = text.toLowerCase().split(/[^a-z-]+/);
  const pos = words.filter(w => POSITIVE.includes(w)).length, neg = words.filter(w => NEGATIVE.includes(w)).length;
  return pos + neg === 0 ? 0 : Number(((pos - neg) / (pos + neg + 1)).toFixed(2));
}
function tokensIn(text: string) {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `;
  return Object.entries(NAMES).filter(([, names]) => names.some(n => t.includes(` ${n} `))).map(([sym]) => sym);
}

export async function latestNews(): Promise<NewsItem[]> {
  const feeds = await Promise.allSettled(FEEDS.map(f => upstream<string>('news', f.url, { ttlMs: 300_000, text: true }).then(xml => ({ ...f, xml }))));
  const items: NewsItem[] = [];
  for (const f of feeds) {
    if (f.status !== 'fulfilled') continue;
    for (const raw of f.value.xml.split('<item').slice(1)) {
      const headline = tag(raw, 'title'), summary = tag(raw, 'description').slice(0, 280), url = tag(raw, 'link') || tag(raw, 'guid');
      const published = Date.parse(tag(raw, 'pubDate'));
      if (!headline || Number.isNaN(published)) continue;
      const text = `${headline} ${summary}`;
      items.push({
        id: `nws_${createHash('sha1').update(url || headline).digest('hex').slice(0, 10)}`, headline, summary, url, source: f.value.source,
        publishedAt: new Date(published).toISOString(), tokens: tokensIn(text), sentiment: score(text),
        impact: HIGH_IMPACT.some(k => text.toLowerCase().includes(k)) ? 'high' : tokensIn(headline).length ? 'medium' : 'low',
      });
    }
  }
  const seen = new Set<string>();
  return items.filter(i => (seen.has(i.headline) ? false : (seen.add(i.headline), true))).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
