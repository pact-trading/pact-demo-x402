import 'server-only';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Address } from 'viem';
import type { CallRecord } from '@/lib/chain';

/** Vaults this app created and every paid call it served. A JSON file for the demo; use a database in production. */
export interface VaultRecord {
  account: Address; owner: Address; sessionKey: Address; label: string; perCallMinor: string; dailyMinor: string;
  expiresAt: string; status: 'active' | 'revoked'; createdAt: string; faucetUsed: boolean; txs: string[];
}
interface Book { vaults: VaultRecord[]; calls: CallRecord[] }

// Vercel functions can only write to /tmp (per instance, cleared on a cold start); locally the repo's data/.
const dir = process.env.VERCEL ? join('/tmp', 'sightline') : join(process.cwd(), 'data'), file = join(dir, 'sightline.json');
const read = (): Book => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { vaults: [], calls: [] });
const write = (book: Book) => { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(book, null, 2)); };
const lower = (a: string) => a.toLowerCase();

export const getVault = (account: string) => read().vaults.find(v => lower(v.account) === lower(account)) ?? null;
export const listVaults = () => read().vaults.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export function saveVault(vault: VaultRecord) {
  const book = read();
  book.vaults = book.vaults.filter(v => lower(v.account) !== lower(vault.account));
  book.vaults.push(vault);
  write(book);
}
export function updateVault(account: string, change: (v: VaultRecord) => void) {
  const book = read();
  const v = book.vaults.find(x => lower(x.account) === lower(account));
  if (!v) return null;
  change(v);
  write(book);
  return v;
}
export function recordCall(call: CallRecord) {
  const book = read();
  if (call.txHash && book.calls.some(c => c.txHash === call.txHash)) return;
  book.calls.unshift(call);
  book.calls = book.calls.slice(0, 2000);
  write(book);
}
export const listCalls = (payer?: string, limit = 100) =>
  read().calls.filter(c => !payer || lower(c.payer) === lower(payer)).slice(0, limit);
