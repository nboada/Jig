"use client";

import { useRouter } from "next/navigation";
import { GridIcon, ListIcon } from "@/components/NavIcons";
import type { View } from "@/lib/view";

const OPTIONS = [
  { view: "grid", label: "Grid view", Icon: GridIcon },
  { view: "list", label: "List view", Icon: ListIcon },
] as const;

/** Switches the index pages between cards and rows. The choice lives in a cookie so the server renders it directly. */
export function ViewToggle({ view }: { view: View }) {
  const router = useRouter();
  function choose(next: View) {
    if (next === view) return;
    document.cookie = `jig-view=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }
  return (
    <div className="flex shrink-0 rounded-md border border-line p-0.5">
      {OPTIONS.map(({ view: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => choose(v)}
          aria-label={label}
          aria-pressed={view === v}
          title={label}
          className={`grid w-8 place-items-center rounded transition ${
            view === v ? "bg-raised text-text" : "text-muted hover:text-text"
          }`}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
