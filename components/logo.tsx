/** A lens and its line of sight. */
export function Mark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#111111" />
      <circle cx="9.5" cy="12" r="4.25" fill="none" stroke="#FFFFFF" strokeWidth="2" />
      <path d="M13.75 12H20" stroke="#4F7BFF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <Mark />
      <span className="text-[17px] font-semibold leading-none tracking-tight text-fg">Sightline</span>
    </span>
  );
}
