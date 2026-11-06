export function Mark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="currentColor" className="text-ink-2" />
      <path d="M8 32c6.5-10 14.7-15 24-15s17.5 5 24 15c-6.5 10-14.7 15-24 15S14.5 42 8 32Z" fill="none" stroke="var(--color-mint)" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="7" fill="var(--color-mint)" />
      <path d="M4 32h56" stroke="var(--color-ink-2)" strokeWidth="3" />
      <path d="M41 32h19" stroke="var(--color-mint)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <Mark />
      <span className="text-[17px] font-semibold tracking-tight text-fg">Sightline</span>
    </span>
  );
}
