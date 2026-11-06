import { NextResponse } from 'next/server';
import { createPactNodeClient } from '@pactagent/node';

export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** Expose only the merchant's current logo; the Pact API key stays on this server. */
export async function GET() {
  const apiKey = process.env.PACT_SECRET_KEY;
  if (!apiKey) return NextResponse.json({ logoUrl: null }, noStore);

  try {
    const pact = createPactNodeClient({ apiKey, baseUrl: process.env.PACT_API_URL ?? 'https://api.pactagent.app' });
    const settings = await pact.settings.get({ signal: AbortSignal.timeout(5000) });
    return NextResponse.json({ logoUrl: settings.logoUrl ?? null }, noStore);
  } catch {
    return NextResponse.json({ logoUrl: null }, noStore);
  }
}
