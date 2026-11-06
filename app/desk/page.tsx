'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createWalletClient, custom, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bootstrapTypedData, explorer, revokeTypedData, sessionTypedData, short, usd, whitechain, type BootstrapMessage, type RevokeMessage, type SessionMessage, type VaultStatus } from '@/lib/chain';
import { forgetDesk, loadDesk, newKey, post, saveDesk, type Desk } from '@/lib/client/vault';

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
declare global { interface Window { ethereum?: Eip1193 } }

type Signer = { address: Address; sign: (typed: ReturnType<typeof sessionTypedData> | ReturnType<typeof bootstrapTypedData> | ReturnType<typeof revokeTypedData>) => Promise<Hex> };

/** The owner signs; either a key made in this browser (quick start) or the user's own wallet. */
async function ownerSigner(desk: Pick<Desk, 'ownerKey' | 'owner'> | null, mode: 'quick' | 'wallet', ownerKey?: Hex): Promise<Signer> {
  const key = ownerKey ?? desk?.ownerKey;
  if (mode === 'quick' && key) {
    const account = privateKeyToAccount(key);
    return { address: account.address, sign: typed => account.signTypedData(typed as never) };
  }
  if (!window.ethereum) throw new Error('No browser wallet found. Install MetaMask or Rabby, or use Quick start.');
  const wallet = createWalletClient({ chain: whitechain, transport: custom(window.ethereum) });
  const [address] = await wallet.requestAddresses();
  try { await wallet.switchChain({ id: whitechain.id }); } catch { await wallet.addChain({ chain: whitechain }); await wallet.switchChain({ id: whitechain.id }); }
  return { address, sign: typed => wallet.signTypedData({ account: address, ...(typed as object) } as never) };
}

const STEPS = ['Owner signs the session policy', 'Owner approves Permit2 (no gas)', 'Deploying your vault on Whitechain', 'Ready'];

export default function DeskPage() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [ready, setReady] = useState(false);
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [mode, setMode] = useState<'quick' | 'wallet'>('quick');
  const [form, setForm] = useState({ label: 'Alpha desk', perCall: '0.10', daily: '5' });
  const [step, setStep] = useState(-1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const refresh = useCallback(async (d: Desk | null = desk) => {
    if (!d) return;
    const r = await fetch(`/api/vault/${d.account}`, { cache: 'no-store' });
    if (r.ok) setVault(await r.json());
    window.dispatchEvent(new Event('sightline:refresh'));
  }, [desk]);
  useEffect(() => { const d = loadDesk(); setDesk(d); setReady(true); if (d) void refresh(d); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!desk) return; const id = setInterval(() => void refresh(), 10_000); return () => clearInterval(id); }, [desk, refresh]);

  async function create() {
    setError(''); setStep(0);
    try {
      const ownerKey = mode === 'quick' ? newKey() : undefined;
      const owner = await ownerSigner(null, mode, ownerKey);
      const sessionKey = newKey();
      const toMinor = (v: string) => String(Math.round(Number(v) * 1_000_000));
      const prepared = await post<{ pendingId: string; account: Address; session: SessionMessage; bootstrap: BootstrapMessage }>('/api/vault/prepare', {
        owner: owner.address, sessionKey: privateKeyToAccount(sessionKey).address, perCallMinor: toMinor(form.perCall), dailyMinor: toMinor(form.daily), label: form.label,
      });
      const sessionSig = await owner.sign(sessionTypedData(prepared.account, prepared.session));
      setStep(1);
      const bootstrapSig = await owner.sign(bootstrapTypedData(prepared.account, prepared.bootstrap));
      setStep(2);
      const d: Desk = { account: prepared.account, sessionKey, ownerKey, owner: owner.address, label: form.label };
      const status = await post<VaultStatus>('/api/vault/create', { pendingId: prepared.pendingId, signatures: [sessionSig, bootstrapSig] });
      saveDesk(d); setDesk(d); setVault(status); setStep(3);
      window.dispatchEvent(new Event('sightline:refresh'));
    } catch (e) {
      setStep(-1); setError(e instanceof Error ? e.message.split('\n')[0] : String(e));
    }
  }
  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setError('');
    try { await fn(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message.split('\n')[0] : String(e)); } finally { setBusy(''); }
  }
  const revoke = () => act('revoke', async () => {
    if (!desk) return;
    const { revoke: message } = await post<{ revoke: RevokeMessage }>(`/api/vault/${desk.account}/revoke-intent`, {});
    const owner = await ownerSigner(desk, desk.ownerKey ? 'quick' : 'wallet');
    const signature = await owner.sign(revokeTypedData(desk.account, message));
    await post(`/api/vault/${desk.account}/revoke`, { revoke: message, signature });
  });
  const copy = (text: string, what: string) => { void navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); };

  if (!ready) return null;

  if (!desk) return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Your desk</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Open a desk. Pay per call.</h1>
      <p className="mt-3 max-w-2xl text-dim">A desk is a small USDT vault on Whitechain that you own. A session key in this browser, or in your AI agent, pays for each call from it, never more than the limits you sign. You can revoke the key or withdraw at any time.</p>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="card p-6">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-ink-2 p-1 text-sm">
            {(['quick', 'wallet'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-lg px-3 py-2 font-semibold transition ${mode === m ? 'bg-ink-3 text-fg' : 'text-dim hover:text-fg'}`}>
                {m === 'quick' ? 'Quick start' : 'Use my wallet'}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-dim">
            {mode === 'quick' ? 'We create an owner key in this browser. Best for trying it out: nothing to install, and you get 2 test USDT.' : 'MetaMask, Rabby or any browser wallet owns the vault. You sign two messages; no gas, no token approval popups.'}
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <label className="sm:col-span-3"><span className="mb-1.5 block text-xs font-semibold text-dim">Desk name</span><input className="input" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-dim">Max per call (USDT)</span><input className="input num" inputMode="decimal" value={form.perCall} onChange={e => setForm({ ...form, perCall: e.target.value })} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-dim">Max per day (USDT)</span><input className="input num" inputMode="decimal" value={form.daily} onChange={e => setForm({ ...form, daily: e.target.value })} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-dim">Session lasts</span><input className="input" value="30 days" disabled /></label>
          </div>
          <button onClick={create} disabled={step >= 0 && step < 3} className="btn btn-mint mt-6 w-full !py-3">{step >= 0 && step < 3 ? 'Opening your desk…' : 'Open desk'}</button>
          {error && <p className="mt-3 text-sm text-rose">{error}</p>}
        </div>
        <div className="card p-6">
          <p className="text-sm font-semibold">What happens</p>
          <ol className="mt-4 space-y-4">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${step > i || step === 3 ? 'border-mint bg-mint text-ink' : step === i ? 'border-mint text-mint' : 'border-line text-faint'}`}>{step > i || step === 3 ? '✓' : i + 1}</span>
                <span className={step === i ? 'text-fg' : 'text-dim'}>{s}{step === i && i === 2 ? ' (about 15 s)' : ''}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 space-y-2 border-t border-line pt-5 text-xs text-dim">
            <p>• Limits are enforced by the vault contract, not by us.</p>
            <p>• Sightline pays the network fees. Pact settles each payment.</p>
            <p>• Only Sightline can be paid from this desk.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const spent = BigInt(vault?.spentTodayMinor ?? '0'), daily = BigInt(vault?.dailyCapMinor ?? '1');
  const pct = Math.min(100, Number((spent * 1000n) / (daily || 1n)) / 10);
  const envBlock = `SIGHTLINE_URL=${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3240'}\nSIGHTLINE_VAULT=${desk.account}\nSIGHTLINE_SESSION_KEY=${desk.sessionKey}`;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Your desk</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{desk.label}</h1>
          <p className="num mt-1 text-sm text-dim">Vault <a className="hover:text-fg" href={`${explorer}/address/${desk.account}`} target="_blank" rel="noreferrer">{desk.account} ↗</a></p>
        </div>
        <div className="flex gap-2">
          <Link href="/terminal" className="btn btn-mint">Open terminal</Link>
        </div>
      </div>
      {error && <p className="mt-4 rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">{error}</p>}

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="card p-5 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-dim">Balance</p>
          <p className="num mt-2 text-4xl font-semibold">{vault ? usd(vault.balanceMinor) : '…'} <span className="text-base font-normal text-dim">USDT</span></p>
          <div className="mt-5 flex flex-wrap gap-2">
            {vault && !vault.faucetUsed && <button className="btn btn-mint" disabled={!!busy} onClick={() => act('faucet', () => post(`/api/vault/${desk.account}/faucet`, {}))}>{busy === 'faucet' ? 'Sending…' : 'Get 2 test USDT'}</button>}
            <button className="btn btn-ghost" onClick={() => copy(desk.account, 'address')}>{copied === 'address' ? 'Copied' : 'Copy deposit address'}</button>
          </div>
          <p className="mt-3 text-xs text-faint">Top up by sending USDT on Whitechain Sepolia to the vault address. Only you (the owner) can withdraw.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-dim">Spent today</p>
          <p className="num mt-2 text-2xl font-semibold">{vault ? usd(vault.spentTodayMinor, 3) : '…'}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-3"><div className="h-full rounded-full bg-mint" style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-xs text-dim">of {vault ? usd(vault.dailyCapMinor) : '…'} daily limit · resets 00:00 UTC</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-dim">Session key</p>
          <p className={`mt-2 text-lg font-semibold ${vault?.status === 'active' ? 'text-mint' : 'text-rose'}`}>{vault?.status ?? '…'}</p>
          <p className="mt-1 text-xs text-dim">Max {vault ? usd(vault.perCallCapMinor) : '…'} per call</p>
          <p className="text-xs text-dim">Until {vault ? new Date(vault.expiresAt).toLocaleDateString() : '…'}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <p className="font-semibold">Paid calls</p>
            <span className="chip">{vault?.calls.length ?? 0} recent</span>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-1 text-left text-xs text-dim"><tr><th className="px-5 py-2 font-medium">When</th><th className="py-2 font-medium">Data</th><th className="py-2 font-medium">From</th><th className="py-2 font-medium">Paid</th><th className="px-5 py-2 text-right font-medium">Settlement</th></tr></thead>
              <tbody>
                {vault?.calls.map(c => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="num px-5 py-2.5 text-dim">{new Date(c.at).toLocaleTimeString()}</td>
                    <td className="py-2.5">{c.endpoint}</td>
                    <td className="py-2.5"><span className="chip">{c.via === 'agent' ? 'AI agent' : c.via === 'web' ? 'Terminal' : 'API'}</span></td>
                    <td className="num py-2.5">{usd(c.priceMinor, 3)}</td>
                    <td className="num px-5 py-2.5 text-right">{c.txHash ? <a className="text-mint hover:underline" href={`${explorer}/tx/${c.txHash}`} target="_blank" rel="noreferrer">{short(c.txHash)} ↗</a> : <span className="text-rose">{c.reason}</span>}</td>
                  </tr>
                ))}
                {!vault?.calls.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-dim">No calls yet. Open the <Link href="/terminal" className="text-mint">terminal</Link> or run the agent.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div id="agent" className="card p-5">
            <p className="font-semibold">Connect an AI agent</p>
            <p className="mt-1 text-sm text-dim">Give your agent this desk&apos;s session key. It pays per call within the same limits, and you can revoke it here.</p>
            <pre className="num mt-4 overflow-x-auto rounded-xl bg-ink p-4 text-[11.5px] leading-relaxed text-dim">{envBlock.replace(desk.sessionKey, `${desk.sessionKey.slice(0, 10)}…${desk.sessionKey.slice(-6)}`)}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-ghost" onClick={() => copy(envBlock, 'env')}>{copied === 'env' ? 'Copied .env' : 'Copy .env for the agent'}</button>
              <Link href="/developers#agent" className="btn btn-ghost">Agent quickstart</Link>
            </div>
          </div>
          <div className="card p-5">
            <p className="font-semibold">Owner controls</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-dim">Owner</dt><dd className="num">{short(desk.owner)} {desk.ownerKey ? <span className="chip ml-1">this browser</span> : <span className="chip ml-1">your wallet</span>}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-dim">Session key</dt><dd className="num">{short(privateKeyToAccount(desk.sessionKey).address)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-dim">Can pay</dt><dd>Sightline only</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-ghost !text-rose" disabled={!!busy || vault?.status !== 'active'} onClick={revoke}>{busy === 'revoke' ? 'Revoking…' : 'Revoke session key'}</button>
              <button className="btn btn-ghost" onClick={() => { if (confirm('Forget this desk in this browser? The vault and its funds stay onchain.')) { forgetDesk(); setDesk(null); setVault(null); setStep(-1); window.dispatchEvent(new Event('sightline:refresh')); } }}>Forget desk</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
