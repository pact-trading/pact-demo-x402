'use client';

import { ArrowUp, ArrowUpRight, Bot, CircleCheck, CircleX, Loader2, Sparkles, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DatasetIcon } from '@/components/dataset-icon';
import { AGENT_TOOLS, toolByName } from '@/lib/agent-tools';
import { ENDPOINTS } from '@/lib/catalog';
import { explorer, short, usd } from '@/lib/chain';
import { quickStartDesk } from '@/lib/client/quick-desk';
import { loadDesk, paidFetch, reason, type Desk } from '@/lib/client/vault';

/** Content blocks as Claude returns them; kept verbatim (thinking included) and sent back each turn. */
type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; [k: string]: unknown };
type ApiMessage = { role: 'user' | 'assistant'; content: string | Block[] };
type Call = { id: string; name: string; input: Record<string, unknown>; status: 'paying' | 'paid' | 'refused'; priceMinor: string; tx: string | null; error?: string };
type Item = { kind: 'user'; text: string } | { kind: 'text'; text: string } | { kind: 'call'; call: Call } | { kind: 'error'; text: string };

const SUGGESTIONS = ['Is SOL worth buying right now?', 'So sánh ETH và SOL hôm nay, nên giữ cái nào?', 'What is moving BTC today?', 'Are traders buying or selling ARB?'];
const label = (name: string, input: Record<string, unknown>) => `${name}(${Object.values(input).map(v => (Array.isArray(v) ? v.join(', ') : String(v))).join(', ')})`;
const ERRORS: Record<string, string> = {
  missing_anthropic_key: 'The analyst is offline: the server has no ANTHROPIC_API_KEY yet.',
  invalid_anthropic_key: 'The analyst is offline: the server’s Claude key was rejected.',
  model_busy: 'The analyst is busy. Try again in a few seconds.',
  rate_limited: 'Too many questions in a minute. Wait a moment.',
  desk_required: 'Open a desk first.',
};

/** Light formatting for the analyst's replies: paragraphs, numbered lines and **bold**. */
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-line">
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith('**') && part.endsWith('**') ? <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong> : part))}
        </p>
      ))}
    </div>
  );
}

function CallCard({ call }: { call: Call }) {
  const tool = toolByName(call.name);
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-ink-2 px-3 py-2 text-sm">
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-white text-dim">{tool ? <DatasetIcon id={tool.endpoint} /> : <Bot size={15} aria-hidden />}</span>
      <span className="num min-w-0 flex-1 truncate text-dim">{label(call.name, call.input)}</span>
      {call.status === 'paying' && <span className="inline-flex items-center gap-1.5 text-faint"><Loader2 size={14} className="animate-spin" aria-hidden /> Paying {usd(call.priceMinor, 3)}</span>}
      {call.status === 'paid' && (
        <span className="inline-flex items-center gap-1.5 text-gain">
          <CircleCheck size={14} aria-hidden /> Paid {usd(call.priceMinor, 3)}
          {call.tx && <a href={`${explorer}/tx/${call.tx}`} target="_blank" rel="noreferrer" className="num inline-flex items-center gap-0.5 text-mint hover:underline">{short(call.tx)}<ArrowUpRight size={12} aria-hidden /></a>}
        </span>
      )}
      {call.status === 'refused' && <span className="inline-flex items-center gap-1.5 text-rose"><CircleX size={14} aria-hidden /> {call.error}</span>}
    </div>
  );
}

export default function Chat() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [ready, setReady] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState('');
  const [input, setInput] = useState('');
  const history = useRef<ApiMessage[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  const refreshBalance = async (d: Desk | null = desk) => {
    if (!d) return;
    const r = await fetch(`/api/vault/${d.account}`, { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setBalance((await r.json()).balanceMinor);
    window.dispatchEvent(new Event('sightline:refresh'));
  };
  useEffect(() => { const d = loadDesk(); setDesk(d); setReady(true); void refreshBalance(d); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);

  const spent = items.reduce((t, i) => t + (i.kind === 'call' && i.call.status === 'paid' ? Number(i.call.priceMinor) : 0), 0);
  const updateCall = (id: string, patch: Partial<Call>) => setItems(list => list.map(i => (i.kind === 'call' && i.call.id === id ? { ...i, call: { ...i.call, ...patch } } : i)));

  async function openDesk() {
    try { const d = await quickStartDesk(setSetup); setDesk(d); await refreshBalance(d); }
    catch (e) { setItems(list => [...list, { kind: 'error', text: e instanceof Error ? e.message : String(e) }]); }
    finally { setSetup(''); }
  }

  async function ask(question: string) {
    if (!desk || !question.trim() || busy) return;
    setInput(''); setBusy(true);
    setItems(list => [...list, { kind: 'user', text: question.trim() }]);
    history.current.push({ role: 'user', content: question.trim() });
    try {
      for (let turn = 0; turn < 8; turn++) {
        const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: desk.account, messages: history.current }) });
        const reply = (await r.json()) as { content?: Block[]; stop_reason?: string; error?: string };
        if (!r.ok || !reply.content) throw new Error(ERRORS[reply.error ?? ''] ?? reply.error ?? `HTTP ${r.status}`);
        history.current.push({ role: 'assistant', content: reply.content });
        for (const b of reply.content) if (b.type === 'text' && b.text?.trim()) setItems(list => [...list, { kind: 'text', text: b.text! }]);
        if (reply.stop_reason === 'refusal') { setItems(list => [...list, { kind: 'error', text: 'The analyst declined this question.' }]); break; }
        if (reply.stop_reason !== 'tool_use') break;

        // Run every requested tool in parallel; each is one x402 payment from the desk.
        const uses = reply.content.filter(b => b.type === 'tool_use');
        const results = await Promise.all(uses.map(async use => {
          const tool = toolByName(use.name!), input = use.input ?? {};
          const priceMinor = ENDPOINTS.find(e => e.id === tool?.endpoint)?.priceMinor ?? '0';
          setItems(list => [...list, { kind: 'call', call: { id: use.id!, name: use.name!, input, status: 'paying', priceMinor, tx: null } }]);
          if (!tool) { updateCall(use.id!, { status: 'refused', error: 'Unknown tool' }); return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Unknown tool' }; }
          const path = ENDPOINTS.find(e => e.id === tool.endpoint)!.path;
          try {
            const paid = await paidFetch<unknown>(desk, `${path}${tool.query(input)}`);
            updateCall(use.id!, { status: 'paid', tx: paid.txHash });
            return { type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(paid.data).slice(0, 12_000) };
          } catch (e) {
            const why = reason(e);
            updateCall(use.id!, { status: 'refused', error: why });
            return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Payment or request refused: ${why}` };
          }
        }));
        history.current.push({ role: 'user', content: results as Block[] });
        void refreshBalance();
      }
    } catch (e) {
      setItems(list => [...list, { kind: 'error', text: e instanceof Error ? e.message : String(e) }]);
      // Drop the unanswered question so the next one starts clean.
      while (history.current.length && history.current.at(-1)!.role === 'user') history.current.pop();
    } finally {
      setBusy(false); void refreshBalance();
    }
  }

  if (!ready) return null;
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col px-5">
      <div className="flex items-center justify-between gap-3 border-b border-line py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-fg text-white"><Sparkles size={16} strokeWidth={1.75} aria-hidden /></span>
          <div><p className="font-semibold leading-tight">Sightline analyst</p><p className="text-xs text-dim">Buys live market data per question, pays from your desk</p></div>
        </div>
        {desk && (
          <div className="flex items-center gap-2 text-sm">
            <span className="chip"><Wallet size={12} strokeWidth={1.75} aria-hidden /> {balance === null ? '…' : usd(balance)} USDT</span>
            {spent > 0 && <span className="chip">This chat {usd(spent, 3)}</span>}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4 py-6">
        {!items.length && (
          <div className="py-10 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Ask about any coin.</h1>
            <p className="mx-auto mt-3 max-w-md text-dim">The analyst decides which data to buy (prices, news, order flow, reports), pays for each call in USDT, and answers with the numbers.</p>
            {!desk ? (
              <div className="card mx-auto mt-8 max-w-md p-5 text-left">
                <p className="font-medium">Your analyst needs a desk to pay from</p>
                <p className="mt-1 text-sm text-dim">A small USDT vault you own, limited to $0.10 per call and $5 a day. One click, with 2 test USDT.</p>
                <button className="btn btn-mint mt-4 w-full" disabled={!!setup} onClick={openDesk}>
                  {setup ? <><Loader2 size={15} className="animate-spin" aria-hidden /> {setup}</> : <><Wallet size={15} strokeWidth={1.75} aria-hidden /> Open a desk and start</>}
                </button>
              </div>
            ) : (
              <div className="mx-auto mt-8 grid max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map(s => <button key={s} onClick={() => ask(s)} className="rounded-md border border-line px-4 py-3 text-left text-sm hover:bg-ink-2">{s}</button>)}
              </div>
            )}
            <p className="mt-6 text-xs text-faint">Tools: {AGENT_TOOLS.map(t => `${t.name} ${usd(ENDPOINTS.find(e => e.id === t.endpoint)!.priceMinor, 3)}`).join(', ')}</p>
          </div>
        )}
        {items.map((item, i) => {
          if (item.kind === 'user') return <div key={i} className="flex justify-end"><p className="max-w-[80%] rounded-lg bg-fg px-4 py-2.5 text-[15px] text-white">{item.text}</p></div>;
          if (item.kind === 'call') return <CallCard key={i} call={item.call} />;
          if (item.kind === 'error') return <p key={i} className="rounded-md border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">{item.text}</p>;
          return <div key={i} className="flex gap-3"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line text-dim"><Sparkles size={14} strokeWidth={1.75} aria-hidden /></span><Rich text={item.text} /></div>;
        })}
        {busy && <p className="flex items-center gap-2 text-sm text-faint"><Loader2 size={14} className="animate-spin" aria-hidden /> Thinking</p>}
        <div ref={bottom} />
      </div>

      <form onSubmit={e => { e.preventDefault(); void ask(input); }} className="sticky bottom-0 bg-white pb-6 pt-2">
        <div className="flex items-end gap-2 rounded-lg border border-line bg-white p-2 focus-within:border-mint">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
            rows={1} placeholder={desk ? 'Ask about a coin, e.g. "Is SOL worth buying?"' : 'Open a desk to start'} disabled={!desk || busy}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none" />
          <button type="submit" disabled={!desk || busy || !input.trim()} aria-label="Send" className="btn btn-mint !p-2.5"><ArrowUp size={16} aria-hidden /></button>
        </div>
        <p className="mt-2 text-center text-xs text-faint">Each data call is paid from your desk within its limits. Research, not financial advice.</p>
      </form>
    </div>
  );
}
