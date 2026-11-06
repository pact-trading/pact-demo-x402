import 'server-only';

/**
 * Upstream calls for Sightline's data providers: a timeout, a small TTL cache (so one paid
 * request never fans out into dozens of upstream calls) and per-provider health for /api/providers.
 */
export interface ProviderStatus { id: string; name: string; source: string; ok: boolean | null; latencyMs: number | null; lastOkAt: string | null; lastError: string | null; calls: number }
const status = new Map<string, ProviderStatus>();
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function registerProvider(id: string, name: string, source: string) {
  if (!status.has(id)) status.set(id, { id, name, source, ok: null, latencyMs: null, lastOkAt: null, lastError: null, calls: 0 });
}
export const providerStatus = () => [...status.values()];

export async function upstream<T>(provider: string, url: string, { ttlMs = 30_000, text = false }: { ttlMs?: number; text?: boolean } = {}): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const running = inflight.get(url);
  if (running) return running as Promise<T>;
  const s = status.get(provider);
  const started = Date.now();
  const job = (async () => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000), cache: 'no-store', headers: { 'user-agent': 'Sightline/1.0 (+market data demo)', accept: text ? 'application/rss+xml, application/xml, text/xml' : 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const value = (text ? await r.text() : await r.json()) as T;
      cache.set(url, { at: Date.now(), value });
      if (s) Object.assign(s, { ok: true, latencyMs: Date.now() - started, lastOkAt: new Date().toISOString(), lastError: null, calls: s.calls + 1 });
      return value;
    } catch (error) {
      if (s) Object.assign(s, { ok: false, latencyMs: Date.now() - started, lastError: (error as Error).message, calls: s.calls + 1 });
      if (hit) return hit.value as T; // serve stale data rather than fail a paid request
      throw error;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, job);
  return job;
}
