import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Expose only the merchant's current logo; the Pact API key stays on this server. */
export async function GET() {
  const base = process.env.PACT_API_URL ?? 'https://api.pactagent.app';
  const key = process.env.PACT_SECRET_KEY;
  if (!key) return NextResponse.json({ logoUrl: null }, { headers: { 'Cache-Control': 'no-store' } });

  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/v1/settings`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Brand unavailable');
    const settings = (await response.json()) as { logoUrl?: string | null };
    return NextResponse.json({ logoUrl: settings.logoUrl ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ logoUrl: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
