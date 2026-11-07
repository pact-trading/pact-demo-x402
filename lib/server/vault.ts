import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { encodeFunctionData, getAddress, isAddress, parseAbiItem, recoverTypedDataAddress, toHex, type Address, type Hex } from 'viem';
import { bootstrapTypedData, EXACT, PERMIT2, revokeTypedData, sessionTypedData, USDT, type BootstrapMessage, type ReservedPayment, type RevokeMessage, type SessionMessage, type VaultStatus } from '@/lib/chain';
import { accountAbi, erc20Abi, factory, factoryAbi, merchant, pub, relayer, revertName, send } from './chain';
import { getVault, listCalls, saveVault, updateVault, type VaultRecord } from './store';

/**
 * The vault's record, from this instance's store or, when another instance created it (Vercel keeps
 * the JSON store per instance), rebuilt from the chain: the factory vouches for the account and the
 * account holds its owner, session key and caps. The faucet counts as used if Sightline's relayer
 * ever sent it USDT, so a lost record cannot claim it twice.
 */
async function findVault(account: string): Promise<VaultRecord | null> {
  const known = getVault(account);
  if (known || !isAddress(account)) return known;
  const address = getAddress(account);
  const ours = await pub.readContract({ address: factory(), abi: factoryAbi, functionName: 'isAccount', args: [address] }).catch(() => false);
  if (!ours) return null;
  const read = <T>(functionName: string) => pub.readContract({ address, abi: accountAbi, functionName: functionName as never }) as Promise<T>;
  const [owner, sessionKey, perCall, daily, expires, latest] = await Promise.all([
    read<Address>('owner'), read<Address>('sessionKey'), read<bigint>('perCallCap'), read<bigint>('dailyCap'), read<bigint>('expiresAt'), pub.getBlockNumber(),
  ]);
  const funded = await pub.getLogs({
    address: USDT,
    event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
    args: { from: relayer().account.address, to: address },
    fromBlock: latest > 500_000n ? latest - 500_000n : 0n,
  }).then(logs => logs.length > 0).catch(() => true);
  const record: VaultRecord = {
    account: address, owner, sessionKey, label: 'Desk', perCallMinor: String(perCall), dailyMinor: String(daily),
    expiresAt: new Date(Number(expires) * 1000).toISOString(), status: sessionKey === '0x0000000000000000000000000000000000000000' ? 'revoked' : 'active',
    createdAt: new Date().toISOString(), faucetUsed: funded, txs: [],
  };
  saveVault(record);
  return record;
}
export { findVault };

export class VaultError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const MAX_APPROVAL = 100_000_000n; // the account's own ceiling for its Permit2 allowance
const MAX_PER_CALL = 1_000_000n; // Pact's facilitator settles at most 1 USDT per payment

type Pending = { owner: Address; salt: Hex; account: Address; label: string; session: SessionMessage; bootstrap: BootstrapMessage; at: number };
const pending = new Map<string, Pending>();
const now = () => Math.floor(Date.now() / 1000);

/** Step 1: where the vault will live and the two messages its owner signs (no gas, no wallet popup for money). */
export async function prepareVault(body: { owner?: string; sessionKey?: string; perCallMinor?: string; dailyMinor?: string; label?: string }) {
  if (!body.owner || !isAddress(body.owner) || !body.sessionKey || !isAddress(body.sessionKey)) throw new VaultError('invalid_addresses');
  const perCall = BigInt(body.perCallMinor ?? '100000'), daily = BigInt(body.dailyMinor ?? '5000000');
  if (perCall <= 0n || perCall > MAX_PER_CALL || daily < perCall || daily > MAX_APPROVAL) throw new VaultError('invalid_limits');
  const owner = getAddress(body.owner), salt = toHex(randomBytes(32));
  // The factory is permissionless; simulating createAccount returns the CREATE2 address it will use.
  const { result: account } = await pub.simulateContract({ address: factory(), abi: factoryAbi, functionName: 'createAccount', args: [owner, salt], account: relayer().account });
  const deadline = String(now() + 540), expiry = String(now() + 30 * 86_400);
  const session: SessionMessage = { key: getAddress(body.sessionKey), perCall: String(perCall), daily: String(daily), expiry, merchants: [merchant()], nonce: '0', deadline };
  const bootstrap: BootstrapMessage = { amount: String(MAX_APPROVAL), nonce: '1', deadline };
  const pendingId = randomUUID();
  for (const [id, p] of pending) if (Date.now() - p.at > 15 * 60_000) pending.delete(id);
  pending.set(pendingId, { owner, salt, account, label: String(body.label ?? 'My research desk').slice(0, 60), session, bootstrap, at: Date.now() });
  return { pendingId, account, session, bootstrap };
}

/** Step 2: check both signatures, then deploy, configure the session and approve Permit2, all relayed. */
export async function createVault(body: { pendingId?: string; signatures?: Hex[] }) {
  const p = pending.get(String(body.pendingId));
  if (!p) throw new VaultError('request_expired', 409);
  const [sessionSig, bootstrapSig] = body.signatures ?? [];
  if (!sessionSig || !bootstrapSig) throw new VaultError('signatures_required');
  const session = sessionTypedData(p.account, p.session), approval = bootstrapTypedData(p.account, p.bootstrap);
  for (const [typed, signature] of [[session, sessionSig], [approval, bootstrapSig]] as const)
    if ((await recoverTypedDataAddress({ ...typed, signature } as never)).toLowerCase() !== p.owner.toLowerCase()) throw new VaultError('invalid_signature');
  pending.delete(String(body.pendingId));
  const m = session.message;
  const txs = [
    await send(factory(), encodeFunctionData({ abi: factoryAbi, functionName: 'createAccount', args: [p.owner, p.salt] }), 2_500_000n),
    await send(p.account, encodeFunctionData({ abi: accountAbi, functionName: 'configureSessionWithSig', args: [m.key, m.perCall, m.daily, m.expiry, m.merchants, m.deadline, sessionSig] }), 400_000n),
    await send(p.account, encodeFunctionData({ abi: accountAbi, functionName: 'bootstrap', args: [approval.message.amount, approval.message.deadline, bootstrapSig] }), 200_000n),
  ];
  saveVault({ account: p.account, owner: p.owner, sessionKey: m.key, label: p.label, perCallMinor: p.session.perCall, dailyMinor: p.session.daily,
    expiresAt: new Date(Number(m.expiry) * 1000).toISOString(), status: 'active', createdAt: new Date().toISOString(), faucetUsed: false, txs });
  return vaultStatus(p.account);
}

export async function vaultStatus(account: string): Promise<VaultStatus> {
  const v = await findVault(account);
  if (!v) throw new VaultError('vault_not_found', 404);
  const day = BigInt(Math.floor(Date.now() / 86_400_000));
  const read = <T>(functionName: string, args: unknown[] = []) => pub.readContract({ address: v.account, abi: accountAbi, functionName: functionName as never, args: args as never }) as Promise<T>;
  const [balance, allowance, spent, key, perCall, daily, expires] = await Promise.all([
    pub.readContract({ address: USDT, abi: erc20Abi, functionName: 'balanceOf', args: [v.account] }),
    pub.readContract({ address: USDT, abi: erc20Abi, functionName: 'allowance', args: [v.account, PERMIT2] }),
    read<bigint>('reservedPerDay', [day]), read<Address>('sessionKey'), read<bigint>('perCallCap'), read<bigint>('dailyCap'), read<bigint>('expiresAt'),
  ]);
  const revoked = key === '0x0000000000000000000000000000000000000000';
  return {
    account: v.account, owner: v.owner, sessionKey: revoked ? v.sessionKey : key, label: v.label,
    balanceMinor: String(balance), spentTodayMinor: String(spent), perCallCapMinor: String(perCall), dailyCapMinor: String(daily), allowanceMinor: String(allowance),
    expiresAt: new Date(Number(expires || 0n) * 1000).toISOString(), createdAt: v.createdAt, faucetUsed: v.faucetUsed,
    status: revoked ? 'revoked' : Number(expires) * 1000 <= Date.now() ? 'expired' : 'active',
    calls: listCalls(v.account, 50),
  };
}

/** The account-bound hash a session key signs for one Permit2 payment (Reservation(permitDigest, epoch)). */
export async function sessionDigest(account: string, digest: string) {
  if (!(await findVault(account))) throw new VaultError('vault_not_found', 404);
  return pub.readContract({ address: account as Address, abi: accountAbi, functionName: 'sessionDigest', args: [digest as Hex] });
}

/**
 * Reserve the payment onchain before the signature is released. The account checks the session key,
 * the per-call and daily caps and the merchant allowlist; Sightline only pays the gas, and only for
 * payments to itself, so this is not a free relay.
 */
export async function reserve(body: { account?: string; payment?: ReservedPayment; signature?: Hex }) {
  const v = body.account ? await findVault(body.account) : null, p = body.payment;
  if (!v || !p || !body.signature) throw new VaultError('invalid_request');
  if (p.to.toLowerCase() !== merchant().toLowerCase()) throw new VaultError('merchant_not_sightline', 403);
  if (p.spender.toLowerCase() !== EXACT.toLowerCase() || BigInt(p.amount) > MAX_PER_CALL) throw new VaultError('unsupported_payment', 403);
  const payment = { spender: p.spender, amount: BigInt(p.amount), nonce: BigInt(p.nonce), deadline: BigInt(p.deadline), to: p.to, facilitator: p.facilitator, validAfter: BigInt(p.validAfter) };
  try {
    // Simulate first: a refused reservation (cap, revoked key) costs nobody gas and carries the reason.
    await pub.simulateContract({ address: v.account, abi: accountAbi, functionName: 'reserve', args: [payment, body.signature], account: relayer().account });
  } catch (error) {
    throw new VaultError(revertName(error), 402);
  }
  const tx = await send(v.account, encodeFunctionData({ abi: accountAbi, functionName: 'reserve', args: [payment, body.signature] }), 300_000n);
  return { reserved: true, tx };
}

export async function revokeIntent(account: string) {
  const v = await findVault(account);
  if (!v) throw new VaultError('vault_not_found', 404);
  const nonce = await pub.readContract({ address: v.account, abi: accountAbi, functionName: 'approvalNonce' });
  return { revoke: { nonce: String(nonce), deadline: String(now() + 540) } satisfies RevokeMessage };
}
export async function revoke(account: string, body: { revoke?: RevokeMessage; signature?: Hex }) {
  const v = await findVault(account);
  if (!v || !body.revoke || !body.signature) throw new VaultError('invalid_request');
  const typed = revokeTypedData(v.account, body.revoke);
  if ((await recoverTypedDataAddress({ ...typed, signature: body.signature })).toLowerCase() !== v.owner.toLowerCase()) throw new VaultError('invalid_signature');
  await send(v.account, encodeFunctionData({ abi: accountAbi, functionName: 'revokeSessionWithSig', args: [typed.message.deadline, body.signature] }), 150_000n);
  updateVault(account, x => { x.status = 'revoked'; });
  return vaultStatus(account);
}

/** Testnet only: a one-time top-up of test USDT so a new desk can try the API straight away. */
export async function faucet(account: string) {
  const v = await findVault(account);
  if (!v) throw new VaultError('vault_not_found', 404);
  if (v.faucetUsed) throw new VaultError('faucet_used', 409);
  const amount = BigInt(Math.round(Number(process.env.FAUCET_USDT ?? '2') * 1_000_000));
  updateVault(account, x => { x.faucetUsed = true; });
  try {
    await send(USDT, encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [v.account, amount] }), 100_000n);
  } catch (error) {
    updateVault(account, x => { x.faucetUsed = false; });
    throw error;
  }
  return vaultStatus(account);
}
