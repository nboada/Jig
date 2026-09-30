"use client";

import { usePathname } from "next/navigation";

export function SplitView({ base, column, children }: { base: string; column: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  const atIndex = rest.length === 0;
  const inPane = rest.length === 1 || (rest.length === 2 && rest[1] === "edit");
  if (!atIndex && !inPane) return <div className="@container">{children}</div>;
  return (
    <div className="md:grid md:grid-cols-[340px_minmax(0,1fr)] md:items-start md:gap-8">
      <div className={atIndex ? "" : "hidden md:block"}>{column}</div>
      <div className={`@container min-w-0 md:pt-1.5 ${atIndex ? "hidden md:block" : ""}`}>{children}</div>
    </div>
  );
}
