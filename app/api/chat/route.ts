import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { AGENT_TOOLS } from '@/lib/agent-tools';
import { getVault } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One turn of the analyst. The server holds the Claude key and returns Claude's reply; when Claude
 * asks for data, the browser runs those tools itself (paying from the desk with its session key)
 * and sends the results back in the next request. The server never holds the session key.
 */
const SYSTEM = `You are Sightline's crypto market analyst, talking to a trader in a chat.
You buy data with tools; every tool call costs the user real USDT from their desk, so buy only what the question needs: batch prices for several tokens into one get_prices call, and use get_insight only for the tokens the user is deciding on. Never call the same tool twice with the same input in one answer.
Answer in the user's language. Lead with a clear verdict, then the evidence with numbers from the tools, then the main risk. Keep it under 180 words. Do not use bullet characters, middle dots or em dashes; use short sentences or numbered lines. Say once at the end that this is research, not financial advice.`;

const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now(), list = (hits.get(key) ?? []).filter(t => now - t < 60_000);
  list.push(now); hits.set(key, list);
  return list.length > 20;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'missing_anthropic_key' }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { account?: string; messages?: Anthropic.Beta.BetaMessageParam[] } | null;
  if (!body?.account || !getVault(body.account)) return NextResponse.json({ error: 'desk_required' }, { status: 401 });
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 60) return NextResponse.json({ error: 'invalid_messages' }, { status: 400 });
  if (limited(body.account)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      system: SYSTEM,
      tools: AGENT_TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema, strict: true })),
      messages: body.messages,
      output_config: { effort: 'medium' },
      // A request declined by a safety classifier is retried on the default fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    return NextResponse.json({ content: response.content, stop_reason: response.stop_reason, usage: response.usage });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'model_busy' }, { status: 429 });
    if (error instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: 'invalid_anthropic_key' }, { status: 503 });
    if (error instanceof Anthropic.APIError) return NextResponse.json({ error: `model_error_${error.status}`, detail: error.message.slice(0, 200) }, { status: 502 });
    throw error;
  }
}
