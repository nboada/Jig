export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
        <path
          d="M12 10l-6 6 6 6M20 10l6 6-6 6"
          fill="none"
          stroke="var(--color-accent-ink)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Jig
    </span>
  );
}
