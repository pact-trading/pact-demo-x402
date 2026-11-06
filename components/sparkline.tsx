/** A small line of real hourly closes (oldest first). */
export function Sparkline({ points, change, width = 96, height = 28 }: { points: number[]; change: number; width?: number; height?: number }) {
  if (points.length < 2) return <svg width={width} height={height} aria-hidden />;
  const n = points.length - 1;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / n) * width).toFixed(1)},${(height - 2 - ((p - min) / span) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={change >= 0 ? 'var(--color-gain)' : 'var(--color-rose)'} strokeWidth="1.4" />
    </svg>
  );
}
