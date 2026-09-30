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

export function ViewToggle({ view, section }: { view: View; section: Section }) {
  const pathname = usePathname();
  const [shown, setShown] = useOptimistic(view);
  const [, startTransition] = useTransition();

  function choose(next: View) {
    if (next === shown) return;
    startTransition(async () => {
      setShown(next);
      await setViewPreference(section, next, next === "grid" && pathname !== `/${section}` ? `/${section}` : undefined);
    });
  }

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
    <div className="flex shrink-0 rounded-lg border border-line bg-well p-0.5">
      {OPTIONS.map(({ view: v, label, key, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => choose(v)}
          aria-label={label}
          aria-pressed={shown === v}
          aria-keyshortcuts={key.toUpperCase()}
          title={`${label} (${key.toUpperCase()})`}
          className={`grid h-6 w-7 place-items-center rounded-md transition ${
            shown === v ? "bg-overlay text-text" : "text-faint hover:text-text"
          }`}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
