import { ENDPOINTS } from '@/lib/catalog';
import { explorer, short, usd } from '@/lib/chain';
import { merchant } from '@/lib/server/chain';
import { listCalls, listVaults } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** Sightline's own view: what it earned over x402, per endpoint and per payer, every call linked onchain. */
export default function Merchant() {
  const calls = listCalls(undefined, 500).filter(c => c.status === 'settled');
  const vaults = listVaults();
  const today = new Date().toISOString().slice(0, 10);
  const sum = (list: typeof calls) => list.reduce((t, c) => t + BigInt(c.priceMinor), 0n);
  const payers = new Set(calls.map(c => c.payer.toLowerCase()));
  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Revenue</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">x402 revenue</h1>
      <p className="num mt-1 text-sm text-dim">Paid to {merchant()} · settled by Pact · no fee on x402</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        {[['Revenue today', usd(sum(calls.filter(c => c.at.startsWith(today))), 3)], ['Revenue, all time', usd(sum(calls), 3)], ['Paid calls', String(calls.length)], ['Paying desks', `${payers.size} / ${vaults.length} open`]].map(([k, v]) => (
          <div key={k} className="card p-5"><p className="text-xs font-semibold uppercase tracking-wider text-dim">{k}</p><p className="num mt-2 text-2xl font-semibold">{v}</p></div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="card p-5">
          <p className="font-semibold">By endpoint</p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {ENDPOINTS.map(e => { const list = calls.filter(c => c.path.startsWith(e.path) || c.endpoint === e.name); return (
              <li key={e.id} className="flex justify-between py-2.5"><span>{e.name}<span className="ml-2 text-xs text-faint">{list.length} calls</span></span><span className="num">{usd(sum(list), 3)}</span></li>
            ); })}
          </ul>
        </div>
        <div className="card overflow-hidden">
          <p className="border-b border-line px-5 py-4 font-semibold">Settlements</p>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-1 text-left text-xs text-dim"><tr><th className="px-5 py-2 font-medium">When</th><th className="py-2 font-medium">Payer (desk)</th><th className="py-2 font-medium">Client</th><th className="py-2 font-medium">Data</th><th className="py-2 font-medium">Amount</th><th className="px-5 py-2 text-right font-medium">Tx</th></tr></thead>
              <tbody>
                {calls.slice(0, 200).map(c => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="num px-5 py-2.5 text-dim">{new Date(c.at).toLocaleString()}</td>
                    <td className="num py-2.5">{short(c.payer)}</td>
                    <td className="py-2.5"><span className="chip">{c.via}</span></td>
                    <td className="py-2.5">{c.endpoint}</td>
                    <td className="num py-2.5">{usd(c.priceMinor, 3)}</td>
                    <td className="num px-5 py-2.5 text-right">{c.txHash && <a className="text-mint hover:underline" href={`${explorer}/tx/${c.txHash}`} target="_blank" rel="noreferrer">{short(c.txHash)} ↗</a>}</td>
                  </tr>
                ))}
                {!calls.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-dim">No paid calls yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
