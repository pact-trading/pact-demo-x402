/**
 * Open a Sightline desk from the command line, no browser needed:
 *   pnpm setup                         # new owner key, 0.10 USDT per call, 5 USDT a day
 *   OWNER_PRIVATE_KEY=0x… pnpm setup   # your own owner key
 *   pnpm setup -- --per-call 0.05 --daily 2
 *
 * The owner signs two messages (session policy, Permit2 approval); Sightline relays them, so
 * neither key needs gas. Writes SIGHTLINE_VAULT and SIGHTLINE_SESSION_KEY to .env.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const { values } = parseArgs({ allowPositionals: true, options: { 'per-call': { type: 'string', default: '0.10' }, daily: { type: 'string', default: '5' }, name: { type: 'string', default: 'Research agent' }, url: { type: 'string' } } });
const url = (values.url ?? process.env.SIGHTLINE_URL ?? 'http://localhost:3240').replace(/\/$/, '');
const minor = (v: string) => String(Math.round(Number(v) * 1_000_000));
const domain = (account: Address) => ({ name: 'Settle X402 Account', version: '1', chainId: 1874, verifyingContract: account }) as const;

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(`${path}: ${json.error ?? r.status}`);
  return json;
}

const ownerKey = (process.env.OWNER_PRIVATE_KEY as Hex | undefined) ?? generatePrivateKey();
const owner = privateKeyToAccount(ownerKey), sessionKey = generatePrivateKey();
console.log(`owner   ${owner.address}${process.env.OWNER_PRIVATE_KEY ? '' : ' (new key, saved to .env as OWNER_PRIVATE_KEY)'}`);

type S = { key: Address; perCall: string; daily: string; expiry: string; merchants: Address[]; nonce: string; deadline: string };
type B = { amount: string; nonce: string; deadline: string };
const p = await post<{ pendingId: string; account: Address; session: S; bootstrap: B }>('/api/vault/prepare', {
  owner: owner.address, sessionKey: privateKeyToAccount(sessionKey).address, perCallMinor: minor(values['per-call']!), dailyMinor: minor(values.daily!), label: values.name,
});
console.log(`vault   ${p.account}`);
const s = p.session, b = p.bootstrap;
const sessionSig = await owner.signTypedData({
  domain: domain(p.account), primaryType: 'Session',
  types: { Session: [{ name: 'key', type: 'address' }, { name: 'perCall', type: 'uint256' }, { name: 'daily', type: 'uint256' }, { name: 'expiry', type: 'uint256' }, { name: 'merchants', type: 'address[]' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
  message: { key: s.key, perCall: BigInt(s.perCall), daily: BigInt(s.daily), expiry: BigInt(s.expiry), merchants: s.merchants, nonce: BigInt(s.nonce), deadline: BigInt(s.deadline) },
});
const bootstrapSig = await owner.signTypedData({
  domain: domain(p.account), primaryType: 'Bootstrap',
  types: { Bootstrap: [{ name: 'amount', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
  message: { amount: BigInt(b.amount), nonce: BigInt(b.nonce), deadline: BigInt(b.deadline) },
});
console.log('signed  session policy + Permit2 approval; deploying (about 15 s)…');
await post('/api/vault/create', { pendingId: p.pendingId, signatures: [sessionSig, bootstrapSig] });
try {
  const v = await post<{ balanceMinor: string }>(`/api/vault/${p.account}/faucet`, {});
  console.log(`funded  ${(Number(v.balanceMinor) / 1e6).toFixed(2)} test USDT`);
} catch (e) { console.log(`faucet  skipped (${(e as Error).message}); send USDT on Whitechain Sepolia to ${p.account}`); }

const previous = existsSync('.env') ? readFileSync('.env', 'utf8').split('\n').filter(l => l && !/^(SIGHTLINE_URL|SIGHTLINE_VAULT|SIGHTLINE_SESSION_KEY|OWNER_PRIVATE_KEY)=/.test(l)) : [];
writeFileSync('.env', [...previous, `SIGHTLINE_URL=${url}`, `SIGHTLINE_VAULT=${p.account}`, `SIGHTLINE_SESSION_KEY=${sessionKey}`, `OWNER_PRIVATE_KEY=${ownerKey}`, ''].join('\n'), { mode: 0o600 });
console.log(`\nDesk ready. Limits: ${values['per-call']} USDT per call, ${values.daily} USDT per day. Keys written to .env.\nNext: pnpm watch   or   pnpm ask "Is SOL being accumulated?"`);
