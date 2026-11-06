/**
 * Sightline client for agents. Every data call is an HTTP request; when Sightline answers
 * 402 Payment Required, the official @x402/fetch client pays it from your desk (an
 * X402AgentAccount you own) with the session key, then retries. Pact settles the USDT onchain.
 *
 * The session key can only spend from the desk, at Sightline, within the per-call and daily
 * limits its owner signed. Those limits live in the vault contract, so a bug in this agent
 * cannot overspend.
 */
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { hashTypedData, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const NETWORK = 'eip155:1874';
export const USDT = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export interface SightlineConfig { url: string; vault: Address; sessionKey: Hex; maxPerCallUsdt?: number }
export interface Receipt { path: string; priceUsdt: number; txHash: string | null }

export function configFromEnv(): SightlineConfig {
  const { SIGHTLINE_URL, SIGHTLINE_VAULT, SIGHTLINE_SESSION_KEY } = process.env;
  if (!SIGHTLINE_VAULT || !SIGHTLINE_SESSION_KEY) throw new Error('Set SIGHTLINE_VAULT and SIGHTLINE_SESSION_KEY (run `pnpm setup`, or copy them from Sightline → Your desk → Connect an AI agent).');
  return { url: (SIGHTLINE_URL ?? 'http://localhost:3240').replace(/\/$/, ''), vault: SIGHTLINE_VAULT as Address, sessionKey: SIGHTLINE_SESSION_KEY as Hex };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
  return json;
}

/** A standard x402 ClientEvmSigner whose address is the vault and whose signature comes from the session key. */
export function vaultSigner(cfg: SightlineConfig) {
  const session = privateKeyToAccount(cfg.sessionKey);
  return {
    address: cfg.vault,
    async signTypedData(typed: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }): Promise<Hex> {
      if (typed.domain.name !== 'Permit2' || String(typed.domain.verifyingContract).toLowerCase() !== PERMIT2.toLowerCase()) throw new Error('unsupported_signature');
      const m = typed.message as { permitted: { amount: bigint }; spender: Address; nonce: bigint; deadline: bigint; witness: { to: Address; facilitator?: Address; validAfter: bigint } };
      // 1. Bind the Permit2 payment to this vault and its current session (the account's own digest).
      const { hash } = await post<{ hash: Hex }>(`${cfg.url}/api/vault/digest`, { account: cfg.vault, digest: hashTypedData(typed as never) });
      const signature = await session.sign({ hash });
      // 2. Reserve it onchain: the vault checks the caps here and refuses with its error name.
      await post(`${cfg.url}/api/vault/reserve`, {
        account: cfg.vault, signature,
        payment: { spender: m.spender, amount: String(m.permitted.amount), nonce: String(m.nonce), deadline: String(m.deadline), to: m.witness.to, facilitator: m.witness.facilitator ?? '0x0000000000000000000000000000000000000000', validAfter: String(m.witness.validAfter) },
      });
      return signature;
    },
  };
}

export function createSightline(cfg: SightlineConfig = configFromEnv()) {
  const maxPerCall = String(Math.round((cfg.maxPerCallUsdt ?? 0.1) * 1_000_000));
  const client = x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: new ExactEvmScheme(vaultSigner(cfg)) }],
    // Client-side guard on top of the vault's own limits: never sign more than this per call.
    spendControls: { allowedAssets: [{ network: NETWORK, asset: USDT, maxAmountPerPayment: maxPerCall }] },
  });
  const paying = wrapFetchWithPayment(fetch, client);
  const receipts: Receipt[] = [];

  async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    const response = await paying(`${cfg.url}${path}${qs.size ? `?${qs}` : ''}`, { headers: { 'x-sightline-client': 'agent' } });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string; errorReason?: string };
      throw new Error(`${path} → HTTP ${response.status} ${body.error ?? body.errorReason ?? ''}`.trim());
    }
    const header = response.headers.get('payment-response');
    const settlement = header ? decodePaymentResponseHeader(header) : null;
    const required = response.headers.get('x-sightline-price');
    receipts.push({ path, priceUsdt: required ? Number(required) : NaN, txHash: settlement?.transaction ?? null });
    return (await response.json()) as T;
  }

  return {
    receipts,
    catalog: () => fetch(`${cfg.url}/api/v1`).then(r => r.json()) as Promise<{ endpoints: Array<{ path: string; name: string; priceUsdt: number }> }>,
    desk: () => fetch(`${cfg.url}/api/vault/${cfg.vault}`).then(r => r.json()) as Promise<{ balanceMinor: string; spentTodayMinor: string; dailyCapMinor: string; perCallCapMinor: string; status: string }>,
    prices: (symbols?: string[]) => get<{ prices: Array<{ symbol: string; price: number; change24h: number; volume24h: number }> }>('/api/v1/prices', { symbols: symbols?.join(',') }),
    news: (token?: string, limit = 8) => get<{ items: Array<{ headline: string; url: string; sentiment: number; tokens: string[]; impact: string; publishedAt: string; source: string }> }>('/api/v1/news', { token, limit }),
    orderFlow: (token: string) => get<{ token: string; price: number; netTakerFlowUsd24h: number; netTakerFlowUsd7d: number; openInterestUsd: number; openInterestChange24hPct: number; fundingRate8h: number; topTraderLongPct: number; largeTrades: Array<{ side: 'buy' | 'sell'; usd: number; price: number; at: string }> }>('/api/v1/smart-money', { token }),
    insight: (token: string) => get<{ token: string; score: number; signal: string; thesis: string; metrics: Record<string, number>; risks: string[] }>('/api/v1/insight', { token }),
  };
}
export type Sightline = ReturnType<typeof createSightline>;
export const usdt = (minor: string | number) => (Number(minor) / 1e6).toFixed(Number(minor) < 10_000 ? 3 : 2);
