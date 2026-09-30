import { Fragment } from "react";

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
