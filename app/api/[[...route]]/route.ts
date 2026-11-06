import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { ENDPOINTS, TOKENS } from '@/lib/catalog';
import { NETWORK, USDT } from '@/lib/chain';
import { merchant } from '@/lib/server/chain';
import { insight, news, prices, smartMoney, teaser } from '@/lib/server/market';
import { paywall } from '@/lib/server/paywall';
import { providerStatus } from '@/lib/server/providers/http';
import { listCalls } from '@/lib/server/store';
import { createVault, faucet, prepareVault, reserve, revoke, revokeIntent, sessionDigest, vaultStatus, VaultError } from '@/lib/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const app = new Hono().basePath('/api');
app.onError((error, c) => {
  if (error instanceof VaultError) return c.json({ error: error.code }, error.status as 400);
  console.error('[api]', error);
  return c.json({ error: 'server_error', detail: error.message.slice(0, 200) }, 500);
});

// ---- free
app.get('/v1', c => c.json({
  name: 'Sightline API', network: NETWORK, asset: USDT, payTo: merchant(), facilitator: 'Pact (pactagent.app)', scheme: 'exact', protocol: 'x402 v2',
  endpoints: ENDPOINTS.map(e => ({ path: e.path, name: e.name, priceUsdt: Number(e.priceMinor) / 1e6, summary: e.summary, params: e.params })),
}));
app.get('/v1/teaser', async c => c.json(await teaser()));
// The upstream providers behind every paid response, with their last latency and health.
app.get('/providers', c => c.json({ data: providerStatus() }));
app.get('/v1/activity', c => c.json({ data: listCalls(undefined, 30).map(({ id, endpoint, priceMinor, payer, txHash, at, via, status }) => ({ id, endpoint, priceMinor, payer, txHash, at, via, status })) }));

// ---- paid: one x402 payment per call, settled by Pact before the data is returned
const paid = paywall();
// Tell clients what they paid (the x402 header carries the settlement, this carries the price).
const pay: typeof paid = async (c, next) => {
  const e = ENDPOINTS.find(x => c.req.path.startsWith(x.path));
  if (e) c.header('x-sightline-price', String(Number(e.priceMinor) / 1e6));
  return paid(c, next);
};
const token = (v: string | undefined, fallback: string) => (v && TOKENS.includes(v.toUpperCase()) ? v.toUpperCase() : fallback);
app.get('/v1/prices', pay, async c => {
  const symbols = (c.req.query('symbols') ?? '').split(',').map(s => s.trim().toUpperCase()).filter(s => TOKENS.includes(s)).slice(0, 20);
  return c.json({ asOf: new Date().toISOString(), prices: await prices(symbols.length ? symbols : undefined) });
});
app.get('/v1/news', pay, async c => c.json(await news(c.req.query('token') ? token(c.req.query('token'), 'BTC') : undefined, Math.min(25, Number(c.req.query('limit') ?? 10) || 10))));
app.get('/v1/smart-money', pay, async c => c.json(await smartMoney(token(c.req.query('token'), 'ETH'))));
app.get('/v1/insight', pay, async c => c.json(await insight(token(c.req.query('token'), 'SOL'))));

// ---- agent vaults (X402AgentAccount): owner signs, Sightline relays, session key spends within caps
app.post('/vault/prepare', async c => c.json(await prepareVault(await c.req.json())));
app.post('/vault/create', async c => c.json(await createVault(await c.req.json()), 201));
app.post('/vault/digest', async c => { const b = await c.req.json(); return c.json({ hash: await sessionDigest(b.account, b.digest) }); });
app.post('/vault/reserve', async c => c.json(await reserve(await c.req.json())));
app.get('/vault/:account', async c => c.json(await vaultStatus(c.req.param('account'))));
app.post('/vault/:account/revoke-intent', async c => c.json(await revokeIntent(c.req.param('account'))));
app.post('/vault/:account/revoke', async c => c.json(await revoke(c.req.param('account'), await c.req.json())));
app.post('/vault/:account/faucet', async c => c.json(await faucet(c.req.param('account'))));

export const GET = handle(app);
export const POST = handle(app);
