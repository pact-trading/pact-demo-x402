/** Smoke test: one paid call to each dataset, printed with its receipt. `pnpm smoke` */
import { createSightline } from './sightline.js';

const s = createSightline();
const p = await s.prices(['BTC', 'ETH', 'SOL']);
console.log('prices  ', p.prices.map(x => `${x.symbol} $${x.price}`).join(', '));
const f = await s.orderFlow('SOL');
console.log('flow    ', `net taker 24h $${(f.netTakerFlowUsd24h / 1e6).toFixed(1)}M, OI ${f.openInterestChange24hPct}%, funding ${f.fundingRate8h}, top traders ${f.topTraderLongPct}% long, ${f.largeTrades.length} large trades`);
const i = await s.insight('SOL');
console.log('insight ', `${i.score} ${i.signal}: ${i.thesis}`);
const n = await s.news('BTC', 3);
console.log('news    ', n.items.map(x => `${x.source}: ${x.headline} (${x.sentiment})`).join(' | '));
console.log('receipts', s.receipts.map(r => `${r.path} $${r.priceUsdt} ${r.txHash?.slice(0, 10)}`).join(', '));
