import { defineChain, type Address, type Hex } from 'viem';

/** Whitechain Sepolia and the canonical x402 contracts Pact's facilitator settles through. */
export const whitechain = defineChain({
  id: 1874,
  name: 'Whitechain Sepolia',
  nativeCurrency: { name: 'WBT', symbol: 'WBT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.whitechain.io'] } },
  blockExplorers: { default: { name: 'Whitechain Explorer', url: 'https://explorer.testnet.whitechain.io' } },
});
export const NETWORK = 'eip155:1874' as const;
export const USDT = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7' as const;
export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;
export const EXACT = '0x402085c248EeA27D92E8b30b2C58ed07f9E20001' as const;
export const UPTO = '0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002' as const;
export const explorer = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://explorer.testnet.whitechain.io';

export const usd = (minor: bigint | string | number, digits = 2) => {
  const n = Number(minor) / 1_000_000;
  return n < 0.01 && n > 0 ? `$${n.toFixed(3)}` : `$${n.toFixed(digits)}`;
};
export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

/**
 * The owner's signed messages for an X402AgentAccount ("Settle X402 Account" v1). Built from plain
 * JSON on both the server (to verify) and the browser (to sign), so both sign the same bytes.
 */
export const vaultDomain = (account: Address) => ({ name: 'Settle X402 Account', version: '1', chainId: 1874, verifyingContract: account }) as const;
export const vaultTypes = {
  Session: [
    { name: 'key', type: 'address' }, { name: 'perCall', type: 'uint256' }, { name: 'daily', type: 'uint256' }, { name: 'expiry', type: 'uint256' },
    { name: 'merchants', type: 'address[]' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
  ],
  Bootstrap: [{ name: 'amount', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }],
  Revoke: [{ name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }],
} as const;

export interface SessionMessage { key: Address; perCall: string; daily: string; expiry: string; merchants: Address[]; nonce: string; deadline: string }
export interface BootstrapMessage { amount: string; nonce: string; deadline: string }
export interface RevokeMessage { nonce: string; deadline: string }

export const sessionTypedData = (account: Address, m: SessionMessage) => ({
  domain: vaultDomain(account), types: { Session: vaultTypes.Session }, primaryType: 'Session' as const,
  message: { key: m.key, perCall: BigInt(m.perCall), daily: BigInt(m.daily), expiry: BigInt(m.expiry), merchants: m.merchants, nonce: BigInt(m.nonce), deadline: BigInt(m.deadline) },
});
export const bootstrapTypedData = (account: Address, m: BootstrapMessage) => ({
  domain: vaultDomain(account), types: { Bootstrap: vaultTypes.Bootstrap }, primaryType: 'Bootstrap' as const,
  message: { amount: BigInt(m.amount), nonce: BigInt(m.nonce), deadline: BigInt(m.deadline) },
});
export const revokeTypedData = (account: Address, m: RevokeMessage) => ({
  domain: vaultDomain(account), types: { Revoke: vaultTypes.Revoke }, primaryType: 'Revoke' as const,
  message: { nonce: BigInt(m.nonce), deadline: BigInt(m.deadline) },
});

/** What a session key reserves before its payment signature is valid (X402AgentAccount.reserve). */
export interface ReservedPayment { spender: Address; amount: string; nonce: string; deadline: string; to: Address; facilitator: Address; validAfter: string }

export interface VaultStatus {
  account: Address; owner: Address; sessionKey: Address; label: string;
  balanceMinor: string; spentTodayMinor: string; perCallCapMinor: string; dailyCapMinor: string; allowanceMinor: string;
  expiresAt: string; status: 'active' | 'revoked' | 'expired'; createdAt: string; faucetUsed: boolean;
  calls: CallRecord[];
}
export interface CallRecord {
  id: string; endpoint: string; path: string; priceMinor: string; payer: Address; txHash: Hex | null;
  status: 'settled' | 'refused'; reason: string | null; at: string; via: 'web' | 'agent' | 'api';
}
