/** A horizon line with a sighting notch: the "line" you read a market by. */
export function Mark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" fill="var(--color-fg)" />
      <path d="M3 15.5h7.2l1.8-7 1.8 7H21" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.8" strokeLinejoin="miter" />
      <circle cx="12" cy="7.2" r="1.6" fill="var(--color-mint)" />
    </svg>
  );
}
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <Mark />
      <span className="text-[17px] font-semibold tracking-tight leading-none text-fg">Sightline</span>
    </span>
  );
}
