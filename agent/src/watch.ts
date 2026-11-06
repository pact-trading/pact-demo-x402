/**
 * A rule-based watcher, no LLM: every interval it buys prices and smart money flows for a
 * watchlist and prints an alert when flows and momentum line up. Each call is paid from the desk.
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
      const flows = await sightline.smartMoney(token);
      const p = prices.find(x => x.symbol === token);
      const line = `${new Date().toLocaleTimeString()}  ${token.padEnd(5)} $${p?.price.toLocaleString(undefined, { maximumFractionDigits: 4 }).padEnd(10)} ${(p?.change24h ?? 0).toFixed(2).padStart(6)}%  smart money ${fmt(flows.netFlowUsd24h).padStart(8)}  ${flows.buyers}↑ ${flows.sellers}↓`;
      const alert = flows.netFlowUsd24h > 25e6 && (p?.change24h ?? 0) < 2 ? '  ◆ ACCUMULATION before price' : flows.netFlowUsd24h < -25e6 ? '  ◆ DISTRIBUTION' : '';
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
