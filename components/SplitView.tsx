"use client";

import { usePathname } from "next/navigation";

/**
 * A toolbar over a list column beside the open item, for a section like /snippets. They show on the
 * section's index and item pages; new, edit and history pages get the full width. On phones only
 * one side shows: the list on the index, the item once one is open.
 */
export function SplitView({
  base,
  toolbar,
  column,
  children,
}: {
  base: string;
  toolbar: React.ReactNode;
  column: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  const atIndex = rest.length === 0;
  const atItem = rest.length === 1 && rest[0] !== "new";
  if (!atIndex && !atItem) return <div className="@container">{children}</div>;
  return (
    <div className="space-y-6">
      {/* The toolbar spans both columns; on phones it goes with the list. */}
      <div className={atIndex ? "" : "hidden md:block"}>{toolbar}</div>
      <div className="md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-8">
        <div className={`md:-mr-4 md:border-r md:border-line md:pr-4 ${atIndex ? "" : "hidden md:block"}`}>{column}</div>
        <div className={`@container min-w-0 ${atIndex ? "hidden md:block" : ""}`}>{children}</div>
      </div>
    </div>
  );
}
