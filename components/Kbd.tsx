export function Kbd({ children, onAccent = false, className = "" }: { children: React.ReactNode; onAccent?: boolean; className?: string }) {
  return (
    <kbd
      className={`rounded border px-1 font-mono text-[10.5px] leading-4 font-normal ${
        onAccent ? "border-accent-ink/25 text-accent-ink/70" : "border-line text-muted"
      } ${className}`}
    >
      {children}
    </kbd>
  );
}
