"use client";

import { usePathname } from "next/navigation";
import { useEffect, useOptimistic, useTransition } from "react";
import { GridIcon, ListIcon } from "@/components/NavIcons";
import { setViewPreference } from "@/app/actions";
import { isPlainKey, type Section, type View } from "@/lib/prefs";

const OPTIONS = [
  { view: "grid", label: "Grid view", key: "g", Icon: GridIcon },
  { view: "list", label: "List view", key: "l", Icon: ListIcon },
] as const;

/**
 * Switches a list page between cards and rows, also with the G and L keys. Each page remembers
 * its own choice in a cookie, so the server renders it directly.
 */
export function ViewToggle({ view, section }: { view: View; section: Section }) {
  const pathname = usePathname();
  // The pressed button moves at once; the page follows when the refresh lands.
  const [shown, setShown] = useOptimistic(view);
  const [, startTransition] = useTransition();

  function choose(next: View) {
    if (next === shown) return;
    startTransition(async () => {
      setShown(next);
      // On an item, the grid has nothing to show beside it: go back to the list, now as cards.
      await setViewPreference(section, next, next === "grid" && pathname !== `/${section}` ? `/${section}` : undefined);
    });
  }

  // Re-registered each render so G and L always see the current state; it is one listener.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const option = OPTIONS.find((o) => isPlainKey(event, o.key));
      if (!option) return;
      event.preventDefault();
      choose(option.view);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="flex shrink-0 rounded-md border border-line p-0.5">
      {OPTIONS.map(({ view: v, label, key, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => choose(v)}
          aria-label={label}
          aria-pressed={shown === v}
          aria-keyshortcuts={key.toUpperCase()}
          title={`${label} (${key.toUpperCase()})`}
          className={`flex min-w-8 items-center justify-center gap-1 rounded px-1.5 transition ${
            shown === v ? "bg-raised text-text" : "text-muted hover:text-text"
          }`}
        >
          <Icon />
          <kbd className="hidden rounded border border-line px-1 font-sans text-[10px] leading-4 text-muted sm:inline">
            {key.toUpperCase()}
          </kbd>
        </button>
      ))}
    </div>
  );
}
