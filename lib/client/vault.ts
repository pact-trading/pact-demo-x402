'use client';

import { ExactEvmScheme } from '@x402/evm/exact/client';
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { hashTypedData, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { NETWORK, PERMIT2, USDT } from '@/lib/chain';

/**
 * The desk kept in this browser: the vault address and its session key. The session key can only
 * spend from the vault, within the caps its owner signed, and only at Sightline. The owner key is
 * kept only when the user chose a quick-start desk instead of their own wallet.
 */
export interface Desk { account: Address; sessionKey: Hex; ownerKey?: Hex; owner: Address; label: string }
const KEY = 'sightline.desk.v1';

export function loadDesk(): Desk | null {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Desk) : null; } catch { return null; }
}
export function saveDesk(desk: Desk) { try { localStorage.setItem(KEY, JSON.stringify(desk)); } catch { /* private mode */ } }
export function forgetDesk() { try { localStorage.removeItem(KEY); } catch { /* private mode */ } }
export const newKey = () => generatePrivateKey();

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
  return json as T;
}
export { post };

/**
 * An x402 client signer for the vault: the payment's "from" is the vault (an ERC-1271 account), and
 * the session key signs the account-bound reservation, which Sightline puts onchain before the
 * signature is released. The vault contract enforces the caps; a refusal arrives as its error name.
 */
export function vaultSigner(desk: Pick<Desk, 'account' | 'sessionKey'>, base = '') {
  const session = privateKeyToAccount(desk.sessionKey);
  return {
    address: desk.account,
    async signTypedData(typed: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }): Promise<Hex> {
      if (typed.domain.name !== 'Permit2' || Number(typed.domain.chainId) !== 1874 || String(typed.domain.verifyingContract).toLowerCase() !== PERMIT2.toLowerCase()) throw new Error('unsupported_signature');
      const m = typed.message as { permitted: { token: Address; amount: bigint }; spender: Address; nonce: bigint; deadline: bigint; witness: { to: Address; facilitator?: Address; validAfter: bigint } };
      if (m.permitted.token.toLowerCase() !== USDT.toLowerCase()) throw new Error('unsupported_asset');
      const digest = hashTypedData(typed as never);
      const { hash } = await post<{ hash: Hex }>(`${base}/api/vault/digest`, { account: desk.account, digest });
      const signature = await session.sign({ hash });
      await post(`${base}/api/vault/reserve`, {
        account: desk.account, signature,
        payment: { spender: m.spender, amount: String(m.permitted.amount), nonce: String(m.nonce), deadline: String(m.deadline), to: m.witness.to, facilitator: m.witness.facilitator ?? '0x0000000000000000000000000000000000000000', validAfter: String(m.witness.validAfter) },
      });
      return signature;
    },
  };
}

export interface PaidResult<T> { data: T; txHash: string | null; priceMinor: string | null }

/** fetch that pays: on 402 it signs, reserves and retries once, then returns the data and the receipt. */
export async function paidFetch<T>(desk: Desk, url: string): Promise<PaidResult<T>> {
  const client = x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: new ExactEvmScheme(vaultSigner(desk)) }],
    spendControls: { allowedAssets: [{ network: NETWORK, asset: USDT, maxAmountPerPayment: '1000000' }] },
  });
  const paying = wrapFetchWithPayment(fetch, client);
  const response = await paying(url, { headers: { 'x-sightline-client': 'web' } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? body.errorReason ?? `HTTP ${response.status}`);
  }
  const header = response.headers.get('payment-response');
  const settlement = header ? decodePaymentResponseHeader(header) : null;
  return { data: (await response.json()) as T, txHash: settlement?.transaction ?? null, priceMinor: null };
}

/** Plain-language reasons for the vault's refusals. */
export const REASONS: Record<string, string> = {
  DailyCap: 'Daily spending limit reached. Raise it or wait until 00:00 UTC.',
  PerCallCap: 'This report costs more than your per-call limit.',
  SessionExpired: 'Your session key expired or was revoked. Create a new desk.',
  Unauthorized: 'This session key is no longer allowed to spend.',
  MerchantDenied: 'Your desk is not allowed to pay this API.',
  InvalidWindow: 'Payment window crossed midnight UTC. Try again.',
  transfer_failed: 'Not enough USDT in your desk. Top it up.',
};
export const reason = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  const key = Object.keys(REASONS).find(k => m.includes(k));
  if (key) return REASONS[key];
  if (/insufficient|balance|exceeds/i.test(m)) return REASONS.transfer_failed;
  return m;
};
