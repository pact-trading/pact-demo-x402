'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { ArrowUp, ArrowUpRight, Bot, CircleCheck, CircleX, Loader2, Sparkles, Wallet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DatasetIcon } from '@/components/dataset-icon';
import { ToolResult } from '@/components/tool-result';
import { AGENT_TOOLS, toolByName } from '@/lib/agent-tools';
import { ENDPOINTS } from '@/lib/catalog';
import { explorer, short, usd } from '@/lib/chain';
import { quickStartDesk } from '@/lib/client/quick-desk';
import { loadDesk, paidFetch, reason, type Desk } from '@/lib/client/vault';

type Receipt = { status: 'paying' | 'paid' | 'refused'; priceMinor: string; tx: string | null; error?: string; data?: unknown };
type ToolPart = { type: string; toolCallId: string; state: string; input?: Record<string, unknown>; errorText?: string };

const SUGGESTIONS = ['Is SOL worth buying right now?', 'Compare ETH and SOL today. Which one should I hold?', 'What is moving BTC today?', 'Are traders buying or selling ARB?'];
const priceOf = (name: string) => ENDPOINTS.find(e => e.id === toolByName(name)?.endpoint)?.priceMinor ?? '0';
const label = (name: string, input: Record<string, unknown> = {}) => `${name}(${Object.values(input).map(v => (Array.isArray(v) ? v.join(', ') : String(v))).join(', ')})`;
const ERRORS: Record<string, string> = {
  missing_openai_key: 'The analyst is offline: the server has no OPENAI_API_KEY yet.',
  rate_limited: 'Too many questions in a minute. Wait a moment.',
  desk_required: 'Open a desk first.',
};
const friendly = (message: string) => { const key = Object.keys(ERRORS).find(k => message.includes(k)); return key ? ERRORS[key] : message; };

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

function CallCard({ name, input, receipt }: { name: string; input?: Record<string, unknown>; receipt?: Receipt }) {
  const tool = toolByName(name);
  const r = receipt ?? { status: 'paying' as const, priceMinor: priceOf(name), tx: null };
  return (
    <div className="overflow-hidden rounded-md border border-line bg-ink-2">
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-white text-dim">{tool ? <DatasetIcon id={tool.endpoint} /> : <Bot size={15} aria-hidden />}</span>
      <span className="num min-w-0 flex-1 truncate text-dim">{label(name, input)}</span>
      {r.status === 'paying' && <span className="inline-flex items-center gap-1.5 text-faint"><Loader2 size={14} className="animate-spin" aria-hidden /> Paying {usd(r.priceMinor, 3)}</span>}
      {r.status === 'paid' && (
        <span className="inline-flex items-center gap-1.5 text-gain">
          <CircleCheck size={14} aria-hidden /> Paid {usd(r.priceMinor, 3)}
          {r.tx && <a href={`${explorer}/tx/${r.tx}`} target="_blank" rel="noreferrer" className="num inline-flex items-center gap-0.5 text-mint hover:underline">{short(r.tx)}<ArrowUpRight size={12} aria-hidden /></a>}
        </span>
      )}
      {r.status === 'refused' && <span className="inline-flex items-center gap-1.5 text-rose"><CircleX size={14} aria-hidden /> {r.error}</span>}
    </div>
    {r.status === 'paid' && tool && <ToolResult endpoint={tool.endpoint} data={r.data} tx={r.tx} explorer={explorer} />}
    </div>
  );
}

export default function Chat() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [ready, setReady] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const [setup, setSetup] = useState('');
  const [setupError, setSetupError] = useState('');
  const [input, setInput] = useState('');
  const deskRef = useRef<Desk | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const refreshBalance = async (d: Desk | null = deskRef.current) => {
    if (!d) return;
    const r = await fetch(`/api/vault/${d.account}`, { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setBalance((await r.json()).balanceMinor);
    window.dispatchEvent(new Event('sightline:refresh'));
  };

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat', body: () => ({ account: deskRef.current?.account }) }), []);
  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport,
    // After the browser has paid for every tool call in a step, send the results back automatically.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Return at once and pay in the background, so every tool call in a step is paid in parallel.
    onToolCall({ toolCall }) { void payFor(toolCall); },
  });

  async function payFor(toolCall: { toolName: string; toolCallId: string; input: unknown }) {
    {
      const d = deskRef.current, tool = toolByName(toolCall.toolName);
      const priceMinor = priceOf(toolCall.toolName);
      const setReceipt = (r: Receipt) => setReceipts(all => ({ ...all, [toolCall.toolCallId]: r }));
      if (!d || !tool) {
        setReceipt({ status: 'refused', priceMinor, tx: null, error: 'No desk' });
        addToolOutput({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, state: 'output-error', errorText: 'No desk to pay from' } as never);
        return;
      }
      setReceipt({ status: 'paying', priceMinor, tx: null });
      const path = ENDPOINTS.find(e => e.id === tool.endpoint)!.path;
      try {
        const paid = await paidFetch<unknown>(d, `${path}${tool.query(toolCall.input as Record<string, unknown>)}`);
        setReceipt({ status: 'paid', priceMinor, tx: paid.txHash, data: paid.data });
        addToolOutput({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output: paid.data } as never);
      } catch (e) {
        const why = reason(e);
        setReceipt({ status: 'refused', priceMinor, tx: null, error: why });
        addToolOutput({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, state: 'output-error', errorText: `Payment or request refused: ${why}` } as never);
      }
      void refreshBalance(d);
    }
  }

  useEffect(() => { const d = loadDesk(); deskRef.current = d; setDesk(d); setReady(true); void refreshBalance(d); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, receipts]);
  // Balances settle a block later, so read again shortly after the answer finishes.
  useEffect(() => { if (status === 'ready') { void refreshBalance(); const t = setTimeout(() => void refreshBalance(), 3000); return () => clearTimeout(t); } }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = status === 'submitted' || status === 'streaming';
  const spent = Object.values(receipts).reduce((t, r) => t + (r.status === 'paid' ? Number(r.priceMinor) : 0), 0);

  async function openDesk() {
    setSetupError('');
    try { const d = await quickStartDesk(setSetup); deskRef.current = d; setDesk(d); await refreshBalance(d); }
    catch (e) { setSetupError(e instanceof Error ? e.message : String(e)); }
    finally { setSetup(''); }
  }
  function ask(text: string) {
    if (!desk || !text.trim() || busy) return;
    setInput('');
    void sendMessage({ text: text.trim() });
  }

  if (!ready) return null;
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col px-5">
      <div className="flex-1 space-y-4 py-6">
        {!messages.length && (
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
                {setupError && <p className="mt-3 text-sm text-rose">{setupError}</p>}
              </div>
            ) : (
              <div className="mx-auto mt-8 grid max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map(s => <button key={s} onClick={() => ask(s)} className="rounded-md border border-line px-4 py-3 text-left text-sm hover:bg-ink-2">{s}</button>)}
              </div>
            )}
            <p className="mt-6 text-xs text-faint">Tools: {AGENT_TOOLS.map(t => `${t.name} ${usd(priceOf(t.name), 3)}`).join(', ')}</p>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className="space-y-3">
            {m.parts.map((part, i) => {
              if (part.type === 'text') {
                if (!part.text.trim()) return null;
                return m.role === 'user'
                  ? <div key={i} className="flex justify-end"><p className="max-w-[80%] rounded-lg bg-fg px-4 py-2.5 text-[15px] text-white">{part.text}</p></div>
                  : <div key={i} className="flex gap-3"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line text-dim"><Sparkles size={14} strokeWidth={1.75} aria-hidden /></span><Rich text={part.text} /></div>;
              }
              if (part.type.startsWith('tool-')) {
                const p = part as unknown as ToolPart;
                return <CallCard key={i} name={p.type.slice(5)} input={p.input} receipt={receipts[p.toolCallId]} />;
              }
              return null;
            })}
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-faint"><Loader2 size={14} className="animate-spin" aria-hidden /> {status === 'submitted' ? 'Thinking' : 'Writing'}</p>}
        {error && <p className="rounded-md border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">{friendly(error.message)}</p>}
        <div ref={bottom} />
      </div>

      <form onSubmit={e => { e.preventDefault(); ask(input); }} className="sticky bottom-0 bg-white pb-6 pt-2">
        <div className="flex items-end gap-2 rounded-lg border border-line bg-white p-2 focus-within:border-mint">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            rows={1} placeholder={desk ? 'Ask about a coin, e.g. "Is SOL worth buying?"' : 'Open a desk to start'} disabled={!desk || busy}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none" />
          <button type="submit" disabled={!desk || busy || !input.trim()} aria-label="Send" className="btn btn-mint !p-2.5"><ArrowUp size={16} aria-hidden /></button>
        </div>
        <p className="mt-2 text-center text-xs text-faint">{spent > 0 ? `This chat spent ${usd(spent, 3)} from your desk${balance === null ? '' : `, ${usd(balance)} left`}. ` : 'Each data call is paid from your desk within its limits. '}Research, not financial advice.</p>
      </form>
    </div>
  );
}
