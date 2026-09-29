/** The small credit line at the foot of the pages other people see: login and share links. */
export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted/70 ${className}`}>
      {`© ${new Date().getFullYear()} · Built by `}
      <a href="https://talkk.com.au" target="_blank" rel="noreferrer" className="text-muted transition hover:text-text">
        TALKK
      </a>
    </p>
  );
}
