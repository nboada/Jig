/**
 * An empty list, a search with no results or a pane waiting for a pick: a small bracket glyph
 * (an empty jig, drawn from the logo's chevrons), a heading, one line and optional actions.
 */
export function EmptyState({
  title,
  children,
  actions,
  className = "",
}: {
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-16 text-center ${className}`}>
      <svg viewBox="0 0 48 32" className="mb-5 h-8 w-12 text-line-strong" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 4 4 16l10 12M34 4l10 12-10 12" />
      </svg>
      {title && <p className="text-body font-semibold text-text">{title}</p>}
      {children && <div className="mt-1 max-w-sm text-ui text-muted">{children}</div>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
