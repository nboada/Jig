"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { GridIcon, ListIcon } from "@/components/NavIcons";
import { isPlainKey, savePref, type Section, type View } from "@/lib/prefs";

const OPTIONS = [
  { view: "grid", label: "Grid view", key: "g", Icon: GridIcon },
  { view: "list", label: "List view", key: "l", Icon: ListIcon },
] as const;

/**
 * Switches a list page between cards and rows, also with the G and L keys. Each page remembers
 * its own choice in a cookie, so the server renders it directly.
 */
export function ViewToggle({ view, section }: { view: View; section: Section }) {
  const router = useRouter();

  useEffect(() => {
    function choose(next: View) {
      if (next === view) return;
      savePref("view", section, next);
      router.refresh();
    }
    function onKeyDown(event: KeyboardEvent) {
      const option = OPTIONS.find((o) => isPlainKey(event, o.key));
      if (!option) return;
      event.preventDefault();
      choose(option.view);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, section, router]);

  return (
    <div className="flex shrink-0 rounded-md border border-line p-0.5">
      {OPTIONS.map(({ view: v, label, key, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => {
            if (v === view) return;
            savePref("view", section, v);
            router.refresh();
          }}
          aria-label={label}
          aria-pressed={view === v}
          aria-keyshortcuts={key.toUpperCase()}
          title={`${label} (${key.toUpperCase()})`}
          className={`flex min-w-8 items-center justify-center gap-1 rounded px-1.5 transition ${
            view === v ? "bg-raised text-text" : "text-muted hover:text-text"
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
