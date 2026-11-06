import 'server-only';
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { whitechain } from '@/lib/chain';

const rpc = process.env.RPC_URL ?? 'https://rpc.testnet.whitechain.io';
export const pub = createPublicClient({ chain: whitechain, transport: http(rpc) });

/** Pact merchant address that receives every payment (the merchant behind PACT_SECRET_KEY). */
export const merchant = () => (process.env.PACT_MERCHANT_ADDRESS ?? '') as Address;
export const factory = () => (process.env.X402_FACTORY_ADDRESS ?? '0xa0Ad49CB5927EB50EAB9E49C269e016F44c8dD33') as Address;

export const accountAbi = parseAbi([
  'function configureSessionWithSig(address key,uint256 perCall,uint256 daily,uint256 expiry,address[] merchants,uint256 deadline,bytes signature)',
  'function revokeSessionWithSig(uint256 deadline,bytes signature)',
  'function bootstrap(uint256 amount,uint256 deadline,bytes signature)',
  'function reserve((address spender,uint256 amount,uint256 nonce,uint256 deadline,address to,address facilitator,uint256 validAfter) payment,bytes signature) returns (bytes32)',
  'function sessionDigest(bytes32 digest) view returns (bytes32)',
  'function approvalNonce() view returns (uint256)',
  'function reservedPerDay(uint256) view returns (uint256)',
  'function sessionKey() view returns (address)',
  'function perCallCap() view returns (uint256)',
  'function dailyCap() view returns (uint256)',
  'function expiresAt() view returns (uint256)',
  'function owner() view returns (address)',
  'error Unauthorized()', 'error InvalidPolicy()', 'error SessionExpired()', 'error MerchantDenied()', 'error PerCallCap()', 'error DailyCap()', 'error InvalidWindow()', 'error AlreadyReserved()',
]);
export const factoryAbi = parseAbi(['function createAccount(address owner,bytes32 salt) returns (address)']);
export const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)']);

/**
 * Sightline's gas relayer. Every vault change is signed by the owner and every reservation by the
 * session key; the relayer only carries them onchain, so nobody but Sightline needs WBT.
 * Sends are serialised so nonces never collide.
 */
let queue: Promise<unknown> = Promise.resolve();
export function relayer() {
  const key = process.env.SIGHTLINE_RELAYER_KEY as Hex | undefined;
  if (!key) throw new Error('SIGHTLINE_RELAYER_KEY is not set');
  return createWalletClient({ account: privateKeyToAccount(key), chain: whitechain, transport: http(rpc) });
}
export function send(to: Address, data: Hex, gas: bigint): Promise<Hex> {
  const run = async () => {
    const wallet = relayer();
    const hash = await wallet.sendTransaction({ to, data, gas });
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== 'success') throw new Error(`transaction_failed:${hash}`);
    return hash;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/** The contract's custom error name from a viem revert, for an honest refusal message. */
export function revertName(error: unknown) {
  const e = error as { cause?: { data?: { errorName?: string } }; shortMessage?: string; message?: string };
  const named = e?.cause?.data?.errorName;
  if (named) return named;
  const text = `${e?.shortMessage ?? ''} ${e?.message ?? ''}`;
  return ['DailyCap', 'PerCallCap', 'MerchantDenied', 'SessionExpired', 'InvalidWindow', 'AlreadyReserved', 'Unauthorized', 'InvalidPolicy'].find(n => text.includes(n)) ?? 'transaction_failed';
}
