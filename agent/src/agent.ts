/**
 * A trading research agent. Claude decides which Sightline data to buy, each tool call is one
 * x402 payment from your desk, and the answer cites what it bought and what it cost.
 *   pnpm ask "Is smart money accumulating SOL, and should I rotate from ETH?"
 *
 * Needs ANTHROPIC_API_KEY (or an `ant auth login` profile) plus the desk from `pnpm setup`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createSightline, usdt } from './sightline.js';

const question = process.argv.slice(2).filter(a => a !== '--').join(' ') || 'Which of ETH, SOL and ARB has the strongest buying right now, and is it a good entry?';
const sightline = createSightline();
const client = new Anthropic();

const token = { type: 'string', description: 'Ticker, e.g. ETH, SOL, BTC, ARB' } as const;
const tools: Anthropic.Beta.BetaTool[] = [
  { name: 'get_prices', description: 'Spot price, 24h change and volume. Costs $0.001 per call. Pass several symbols in one call.', strict: true,
    input_schema: { type: 'object', properties: { symbols: { type: 'array', items: { type: 'string' }, description: 'Tickers' } }, required: ['symbols'], additionalProperties: false } },
  { name: 'get_news', description: 'Latest headlines from CoinDesk, Cointelegraph and Decrypt mentioning the token, with sentiment (-1..1) and impact. Costs $0.005 per call.', strict: true,
    input_schema: { type: 'object', properties: { token }, required: ['token'], additionalProperties: false } },
  { name: 'get_order_flow', description: 'Binance Futures order flow: net taker buy minus sell (24h, 7d), open interest and its 24h change, funding rate, share of top trader accounts that are long, and the largest recent trades. Costs $0.02 per call.', strict: true,
    input_schema: { type: 'object', properties: { token }, required: ['token'], additionalProperties: false } },
  { name: 'get_insight', description: 'Full token report built from prices, order flow and news: 0-100 score with its parts, signal, thesis, 7d change, volatility, risks. Costs $0.05 per call; use it only for the tokens you will recommend.', strict: true,
    input_schema: { type: 'object', properties: { token }, required: ['token'], additionalProperties: false } },
];

async function run(name: string, input: Record<string, unknown>) {
  const t = String(input.token ?? '');
  switch (name) {
    case 'get_prices': return sightline.prices((input.symbols as string[]) ?? []);
    case 'get_news': return sightline.news(t, 6);
    case 'get_order_flow': return sightline.orderFlow(t);
    case 'get_insight': return sightline.insight(t);
    default: throw new Error(`unknown tool ${name}`);
  }
}

const desk = await sightline.desk();
console.log(`Desk: ${usdt(desk.balanceMinor)} USDT, limit ${usdt(desk.perCallCapMinor)} per call, ${usdt(desk.dailyCapMinor)} per day.\n\n? ${question}\n`);

const system = `You are a crypto market research analyst. You buy data from Sightline per call; every tool call costs real USDT, so buy only what the question needs (prices for several tokens in one call; insight reports only for tokens you end up recommending). Today is ${new Date().toISOString().slice(0, 10)}. Answer in under 200 words: a verdict first, then the evidence with numbers, then the main risk. This is research, not financial advice.`;
const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: question }];

for (let turn = 0; turn < 12; turn++) {
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5', max_tokens: 16000, system, tools, messages,
    output_config: { effort: 'medium' },
    // If a request is declined by a safety classifier, retry it on the default fallback model.
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
  });
  messages.push({ role: 'assistant', content: response.content });
  if (response.stop_reason === 'refusal') { console.log('The model declined this request.'); break; }
  if (response.stop_reason !== 'tool_use') {
    for (const block of response.content) if (block.type === 'text') console.log(block.text);
    break;
  }
  const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
  await Promise.all(response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use').map(async block => {
    try {
      const data = await run(block.name, block.input as Record<string, unknown>);
      const receipt = sightline.receipts.at(-1);
      console.log(`  ✓ ${block.name}(${JSON.stringify(block.input)})  paid $${receipt?.priceUsdt ?? '?'}  tx ${receipt?.txHash?.slice(0, 12) ?? '-'}`);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(data) });
    } catch (e) {
      console.log(`  ✗ ${block.name}: ${(e as Error).message}`);
      results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: `Payment or request refused: ${(e as Error).message}` });
    }
  }));
  messages.push({ role: 'user', content: results });
}

const spent = sightline.receipts.reduce((t, r) => t + (Number.isFinite(r.priceUsdt) ? r.priceUsdt : 0), 0);
console.log(`\n${sightline.receipts.length} paid calls, $${spent.toFixed(3)} USDT, settled by Pact on Whitechain.`);
