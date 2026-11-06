import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, jsonSchema, stepCountIs, streamText, tool, type UIMessage } from 'ai';
import { NextResponse } from 'next/server';
import { AGENT_TOOLS } from '@/lib/agent-tools';
import { getVault } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The analyst, on the Vercel AI SDK with OpenAI. Tools have no `execute`: the model's tool calls
 * stream to the browser, which runs each one as an x402 payment from the desk (the session key never
 * leaves the browser) and sends the result back. This server only holds the OpenAI key.
 */
const SYSTEM = `You are Sightline's crypto market analyst, talking to a trader in a chat.
You buy data with tools; every tool call costs the user real USDT from their desk, so buy only what the question needs: batch prices for several tokens into one get_prices call, and use get_insight only for the tokens the user is deciding on. Never call the same tool twice with the same input in one answer.
Answer in the user's language. Lead with a clear verdict, then the evidence with numbers from the tools, then the main risk. Keep it under 180 words. Do not use bullet characters, middle dots or em dashes; use short sentences or numbered lines. Say once at the end that this is research, not financial advice.`;

const tools = Object.fromEntries(AGENT_TOOLS.map(t => [t.name, tool({ description: t.description, inputSchema: jsonSchema(t.input_schema as never) })]));

const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now(), list = (hits.get(key) ?? []).filter(t => now - t < 60_000);
  list.push(now); hits.set(key, list);
  return list.length > 30;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'missing_openai_key' }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { account?: string; messages?: UIMessage[] } | null;
  if (!body?.account || !getVault(body.account)) return NextResponse.json({ error: 'desk_required' }, { status: 401 });
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 80) return NextResponse.json({ error: 'invalid_messages' }, { status: 400 });
  if (limited(body.account)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL || 'gpt-5.4'),
    system: SYSTEM,
    messages: await convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(8),
  });
  return result.toUIMessageStreamResponse({ onError: error => (error instanceof Error ? error.message : 'model_error') });
}
