"use client";

import { useOptimistic, useTransition } from "react";
import { setPinned } from "@/app/actions";
import { iconButton } from "@/components/Button";
import { useOptionalList } from "@/components/ListContext";
import { PinIcon } from "@/components/NavIcons";
import { Tip } from "@/components/Tooltip";

/**
 * The pin among an item's actions. Filled in the accent colour when pinned; changes at once,
 * moves the item in the list, then saves.
 */
export function PinButton({ kind, slug, pinned }: { kind: "snippets" | "notes"; slug: string; pinned: boolean }) {
  const list = useOptionalList();
  const [shown, setShown] = useOptimistic(pinned);
  const [, startTransition] = useTransition();
  const label = shown ? "Unpin" : "Pin to top";
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={shown}
        onClick={() =>
          startTransition(async () => {
            setShown(!shown);
            list?.pin(slug, !shown);
            // The button goes back by itself when the transition ends; the list needs telling.
            if ((await setPinned(kind, slug, !shown)).error) list?.pin(slug, shown);
          })
        }
        className={iconButton({ className: shown ? "text-accent hover:text-accent" : "" })}
      >
        <PinIcon className={`size-4 ${shown ? "fill-current" : ""}`} />
      </button>
    </Tip>
  );
}
