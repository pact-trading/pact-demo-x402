import { ArrowRight, CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { providerStatus } from '@/lib/server/providers/http';
import '@/lib/server/providers/binance';
import '@/lib/server/providers/coingecko';
import '@/lib/server/providers/news';
import { DatasetIcon } from '@/components/dataset-icon';
import Link from 'next/link';
import { ENDPOINTS } from '@/lib/catalog';
import { usd } from '@/lib/chain';

const Code = ({ children }: { children: string }) => <pre className="num overflow-x-auto rounded-md border border-line bg-ink p-4 text-[12.5px] leading-relaxed text-dim">{children}</pre>;

export const dynamic = 'force-dynamic';

export default function Developers() {
  const providers = providerStatus();
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-2 text-sm text-dim">
          {[['How paying works', '#flow'], ['Endpoints', '#endpoints'], ['Data sources', '#sources'], ['AI agent quickstart', '#agent'], ['Any x402 client', '#client'], ['Limits and errors', '#limits']].map(([l, h]) => <a key={h} href={h} className="block hover:text-fg">{l}</a>)}
        </nav>
      </aside>
      <div className="min-w-0 space-y-16">
        <section id="flow">
          <p className="text-sm text-dim">API reference</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">One HTTP request, one payment.</h1>
          <p className="mt-4 max-w-2xl text-dim">Sightline speaks x402 v2. Call an endpoint without paying and you get <span className="num text-fg">402 Payment Required</span> with the price. Your client signs a USDT payment from its desk and retries; Pact verifies and settles it on Whitechain, then you get the data and a receipt in the <span className="num text-fg">PAYMENT-RESPONSE</span> header.</p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-4">
            {[['GET /api/v1/insight', '402 with price and payTo'], ['Session key signs', 'Desk reserves it within its limits'], ['Retry with payment', 'Pact verifies and settles'], ['200 + data', 'Receipt: tx on Whitechain']].map(([a, b], i) => (
              <li key={a} className="card p-4"><p className="num text-xs text-mint">0{i + 1}</p><p className="mt-2 text-sm font-semibold">{a}</p><p className="mt-1 text-xs text-dim">{b}</p></li>
            ))}
          </ol>
        </section>

        <section id="endpoints">
          <h2 className="text-2xl font-semibold">Endpoints</h2>
          <p className="mt-2 text-sm text-dim">Network <span className="num">eip155:1874</span>, asset USDT, scheme <span className="num">exact</span> (Permit2), free catalogue at <a className="num text-mint" href="/api/v1">GET /api/v1</a></p>
          <div className="mt-6 space-y-4">
            {ENDPOINTS.map(e => (
              <div key={e.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-7 place-items-center rounded-md border border-line text-dim"><DatasetIcon id={e.id} /></span><span className="chip !text-mint">GET</span><span className="num font-semibold">{e.path}</span>
                  <span className="num ml-auto text-lg font-semibold">{usd(e.priceMinor, 3)}</span>
                </div>
                <p className="mt-2 text-sm text-dim">{e.summary}</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <table className="text-sm"><tbody>{e.params.map(p => <tr key={p.name} className="border-t border-line"><td className="num py-2 pr-3 text-fg">{p.name}</td><td className="num py-2 pr-3 text-dim">{p.example}</td><td className="py-2 text-faint">{p.note}</td></tr>)}</tbody></table>
                  <Code>{e.sample}</Code>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="sources">
          <h2 className="text-2xl font-semibold">Data sources</h2>
          <p className="mt-2 max-w-2xl text-sm text-dim">Every paid response is built at request time from these upstream providers, cached for a few seconds to a few minutes. Live status: <a className="num text-mint" href="/api/providers">GET /api/providers</a></p>
          <div className="card mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-faint"><tr><th className="px-5 py-3">Provider</th><th className="py-3">Source</th><th className="py-3">Status</th><th className="py-3 text-right">Latency</th><th className="px-5 py-3 text-right">Calls</th></tr></thead>
            <tbody>
              {providers.map(p => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-5 py-3 font-medium">{p.name}</td>
                  <td className="py-3 text-dim">{p.source}</td>
                  <td className="py-3"><span className={`inline-flex items-center gap-1.5 ${p.ok === false ? 'text-rose' : p.ok ? 'text-gain' : 'text-faint'}`}>{p.ok === false ? <CircleX size={14} aria-hidden /> : p.ok ? <CircleCheck size={14} aria-hidden /> : <CircleDashed size={14} aria-hidden />}{p.ok === false ? p.lastError : p.ok ? 'Healthy' : 'Not called yet'}</span></td>
                  <td className="num py-3 text-right text-dim">{p.latencyMs === null ? '' : `${p.latencyMs} ms`}</td>
                  <td className="num px-5 py-3 text-right text-dim">{p.calls}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>

        <section id="agent">
          <h2 className="text-2xl font-semibold">AI agent quickstart</h2>
          <p className="mt-2 max-w-2xl text-sm text-dim">The sample agent in <span className="num text-fg">agent/</span> is a trading research analyst built on Claude. Each tool is a paid Sightline endpoint, so it decides what data is worth buying. It also ships a no-LLM watcher.</p>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <Code>{`cd agent && pnpm install

# 1. Open a desk (owner key + session key, 2 test USDT)
pnpm setup -- --per-call 0.10 --daily 5
#   or paste the .env from Your desk → Connect an AI agent

# 2. Watch flows, paid per call, no LLM
pnpm watch -- --tokens ETH,SOL --every 60

# 3. Ask Claude; it buys the data it needs
export ANTHROPIC_API_KEY=…
pnpm ask "Is SOL seeing real buying?"`}</Code>
            <Code>{`import { createSightline } from './sightline.js';

const sightline = createSightline({
  url: 'http://localhost:3240',
  vault: process.env.SIGHTLINE_VAULT,        // your desk
  sessionKey: process.env.SIGHTLINE_SESSION_KEY,
  maxPerCallUsdt: 0.10,                       // client-side guard
});

const flow = await sightline.orderFlow('SOL');   // pays $0.02
const report = await sightline.insight('SOL');   // pays $0.05
console.log(report.signal, sightline.receipts);`}</Code>
          </div>
        </section>

        <section id="client">
          <h2 className="text-2xl font-semibold">Any x402 client</h2>
          <p className="mt-2 max-w-2xl text-sm text-dim">The desk is an ordinary x402 payer: wrap <span className="num">fetch</span> with the official <span className="num">@x402/fetch</span> client and give it a signer whose address is the vault. The signer asks the vault for the session-bound digest, signs it with the session key, and reserves the payment before returning the signature.</p>
          <div className="mt-5"><Code>{`import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm/exact/client';

const client = x402Client.fromConfig({
  schemes: [{ network: 'eip155:1874', client: new ExactEvmScheme(vaultSigner({ vault, sessionKey })) }],
  spendControls: { allowedAssets: [{ network: 'eip155:1874', asset: USDT, maxAmountPerPayment: '100000' }] },
});
const pay = wrapFetchWithPayment(fetch, client);
const res = await pay('http://localhost:3240/api/v1/news?token=SOL');`}</Code></div>
        </section>

        <section id="limits">
          <h2 className="text-2xl font-semibold">Limits and errors</h2>
          <div className="mt-5 overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs text-dim"><tr><th className="pb-2 font-medium">Refusal</th><th className="pb-2 font-medium">Means</th></tr></thead>
            <tbody>
              {[['PerCallCap', 'The price is above the desk’s per-call limit.'], ['DailyCap', 'Today’s limit is spent; resets 00:00 UTC.'], ['SessionExpired', 'The key expired (30 days) or was revoked by the owner.'], ['MerchantDenied', 'The desk may only pay Sightline.'], ['transfer failed', 'Not enough USDT in the desk.']].map(([a, b]) => <tr key={a} className="border-t border-line"><td className="num py-2.5 pr-4 text-rose">{a}</td><td className="py-2.5 text-dim">{b}</td></tr>)}
            </tbody>
          </table></div>
          <p className="mt-4 text-sm text-dim">Refusals are checked by the vault contract before anything is broadcast, so a refused call costs nothing. Pact settles at most 1 USDT per payment. <Link href="/desk" className="inline-flex items-center gap-1 text-mint">Open a desk <ArrowRight size={14} strokeWidth={1.75} aria-hidden /></Link></p>
        </section>
      </div>
    </div>
  );
}
