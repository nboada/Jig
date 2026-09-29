import { Fragment } from "react";

/**
 * The engraved metadata line under a title or in a row: "v14 · Claude Code (MCP) · 2 hours ago".
 * Falsy parts are skipped, so callers can pass conditionals straight in.
 */
export function Meta({ children, className = "" }: { children: React.ReactNode[]; className?: string }) {
  const parts = children.filter((part) => part !== null && part !== undefined && part !== false && part !== "");
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-meta text-muted ${className}`}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="text-faint" aria-hidden>
              ·
            </span>
          )}
          {part}
        </Fragment>
      ))}
    </p>
  );
}
