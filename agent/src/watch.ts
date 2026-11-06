/**
 * A rule-based watcher, no LLM: every interval it buys prices and order flow for a watchlist
 * and prints an alert when flow and price disagree. Each call is paid from the desk.
 *   pnpm watch                         # ETH,SOL,BTC every 60 s
 *   pnpm watch -- --tokens SOL,ARB --every 30 --rounds 3
 */
import { parseArgs } from 'node:util';
import { createSightline, usdt } from './sightline.js';

const { values } = parseArgs({ allowPositionals: true, options: { tokens: { type: 'string', default: 'ETH,SOL,BTC' }, every: { type: 'string', default: '60' }, rounds: { type: 'string', default: '0' } } });
const tokens = values.tokens!.split(',').map(t => t.trim().toUpperCase());
const sightline = createSightline();
const fmt = (usd: number) => `${usd >= 0 ? '+' : '-'}$${(Math.abs(usd) / 1e6).toFixed(1)}M`;

const desk = await sightline.desk();
console.log(`desk ${desk.status}: ${usdt(desk.balanceMinor)} USDT, spent today ${usdt(desk.spentTodayMinor)} of ${usdt(desk.dailyCapMinor)}\n`);

for (let round = 1; ; round++) {
  try {
    const { prices } = await sightline.prices(tokens);
    for (const token of tokens) {
      const flows = await sightline.orderFlow(token);
      const p = prices.find(x => x.symbol === token);
      const line = `${new Date().toLocaleTimeString()}  ${token.padEnd(5)} $${p?.price.toLocaleString(undefined, { maximumFractionDigits: 4 }).padEnd(10)} ${(p?.change24h ?? 0).toFixed(2).padStart(6)}%  taker flow ${fmt(flows.netTakerFlowUsd24h).padStart(8)}  OI ${flows.openInterestChange24hPct >= 0 ? '+' : ''}${flows.openInterestChange24hPct.toFixed(1)}%  top traders ${flows.topTraderLongPct}% long`;
      const alert = flows.netTakerFlowUsd24h > 0 && (p?.change24h ?? 0) < 0 ? '  [ALERT] buying into weakness' : flows.netTakerFlowUsd24h < 0 && (p?.change24h ?? 0) > 0 ? '  [ALERT] selling into strength' : '';
      console.log(line + alert);
    }
  } catch (e) {
    console.error(`refused: ${(e as Error).message}`);
  }
  const last = sightline.receipts.slice(-(tokens.length + 1));
  console.log(`  paid ${last.length} calls: ${last.filter(r => r.txHash).map(r => r.txHash!.slice(0, 10)).join(' ')}\n`);
  if (Number(values.rounds) && round >= Number(values.rounds)) break;
  await new Promise(r => setTimeout(r, Number(values.every) * 1000));
}
