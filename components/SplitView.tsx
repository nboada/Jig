"use client";

import { usePathname } from "next/navigation";

/**
 * A list column beside the open item, for a section like /snippets. The column (with its search
 * and filters) shows on the section's index, item, new and edit pages, so writing happens beside
 * the list; history pages (which have their own list of versions) get the full width. On phones
 * only one side shows: the list on the index, the page once one is open.
 */
export function SplitView({ base, column, children }: { base: string; column: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  const atIndex = rest.length === 0;
  // /new, /<slug> and /<slug>/edit sit beside the list.
  const inPane = rest.length === 1 || (rest.length === 2 && rest[1] === "edit");
  if (!atIndex && !inPane) return <div className="@container">{children}</div>;
  return (
    <div className="md:grid md:grid-cols-[340px_minmax(0,1fr)] md:items-start md:gap-8">
      <div className={atIndex ? "" : "hidden md:block"}>{column}</div>
      <div className={`@container min-w-0 md:pt-1.5 ${atIndex ? "hidden md:block" : ""}`}>{children}</div>
    </div>
  );
}
