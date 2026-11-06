/** A small 24h line. The shape is seeded by the symbol and ends at the real 24h change. */
export function Sparkline({ seed, change, width = 96, height = 28 }: { seed: string; change: number; width?: number; height?: number }) {
  let h = 2166136261;
  const rnd = () => { for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); h = Math.imul(h ^ (h >>> 13), 2246822507); return ((h >>> 0) % 10_000) / 10_000; };
  const points: number[] = [0];
  for (let i = 1; i < 24; i++) points.push(points[i - 1] + (rnd() - 0.5) * 1.2 + change / 24);
  points[23] = change;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / 23) * width).toFixed(1)},${(height - 2 - ((p - min) / span) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={change >= 0 ? 'var(--color-gain)' : 'var(--color-rose)'} strokeWidth="1.4" />
    </svg>
  );
}
