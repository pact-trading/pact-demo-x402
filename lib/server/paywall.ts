import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { HTTPFacilitatorClient, x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { paymentMiddleware } from '@x402/hono';
import type { MiddlewareHandler } from 'hono';
import type { Address, Hex } from 'viem';
import { ENDPOINTS } from '@/lib/catalog';
import { NETWORK, USDT } from '@/lib/chain';
import { merchant } from './chain';
import { recordCall } from './store';

/** Which surface made the current paid request, for the merchant dashboard. */
export const caller = new AsyncLocalStorage<{ via: 'web' | 'agent' | 'api'; path: string }>();

/**
 * Pact is the facilitator: it verifies the Permit2 payment and settles it onchain, paying the gas.
 * It authenticates us with our Pact secret key, whose merchant address must be the payment's payTo.
 * Settlement can answer "pending" while the transaction confirms; we wait so the paid response
 * carries the settled transaction hash.
 */
function pactFacilitator(): FacilitatorClient {
  const auth = { Authorization: `Bearer ${process.env.PACT_SECRET_KEY}` };
  const http = new HTTPFacilitatorClient({ url: process.env.PACT_API_URL ?? 'https://api.pactagent.app', createAuthHeaders: async () => ({ verify: auth, settle: auth, supported: {} }) });
  return {
    verify: (payload, requirements) => http.verify(payload, requirements),
    getSupported: () => http.getSupported(),
    settle: async (payload, requirements) => {
      for (let i = 0; ; i++) {
        const result = await http.settle(payload, requirements);
        if (result.success || !/pending/i.test(String(result.errorReason)) || i >= 60) return result;
        await new Promise(r => setTimeout(r, 750));
      }
    },
  };
}

let middleware: MiddlewareHandler | null = null;
export function paywall(): MiddlewareHandler {
  if (middleware) return middleware;
  const server = new x402ResourceServer(pactFacilitator()).register(NETWORK, new ExactEvmScheme());
  server.onAfterSettle(async ({ result, requirements, paymentPayload }) => {
    const ctx = caller.getStore();
    const endpoint = ENDPOINTS.find(e => ctx?.path.startsWith(e.path)) ?? ENDPOINTS.find(e => e.priceMinor === requirements.amount);
    const from = (paymentPayload.payload as { permit2Authorization?: { from?: string } }).permit2Authorization?.from;
    recordCall({ id: `call_${randomUUID().slice(0, 12)}`, endpoint: endpoint?.name ?? 'API', path: ctx?.path ?? endpoint?.path ?? '', priceMinor: requirements.amount,
      payer: (result.payer ?? from ?? '0x') as Address, txHash: (result.transaction || null) as Hex | null, status: result.success ? 'settled' : 'refused',
      reason: result.success ? null : result.errorReason ?? 'settlement_failed', at: new Date().toISOString(), via: ctx?.via ?? 'api' });
  });
  const routes = Object.fromEntries(ENDPOINTS.map(e => [`GET ${e.path}`, {
    accepts: { scheme: 'exact', network: NETWORK, payTo: merchant(), price: { asset: USDT, amount: e.priceMinor, extra: { assetTransferMethod: 'permit2' } }, maxTimeoutSeconds: 120 },
    description: `Sightline · ${e.name}`, mimeType: 'application/json',
  }]));
  // Initialise lazily on the first paid request (syncs supported kinds from Pact once).
  const inner = paymentMiddleware(routes as never, server, undefined, undefined, true);
  middleware = async (c, next) => {
    const via = (c.req.header('x-sightline-client') as 'web' | 'agent' | undefined) ?? 'api';
    return caller.run({ via: via === 'web' || via === 'agent' ? via : 'api', path: c.req.path }, () => inner(c, next));
  };
  return middleware;
}
