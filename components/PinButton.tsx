"use client";

import { useOptimistic, useTransition } from "react";
import { setPinned } from "@/app/actions";
import { useOptionalList } from "@/components/ListContext";
import { PinIcon } from "@/components/NavIcons";

/**
 * The pin beside an item's title: a state of the item, so it sits with its name. Filled in the
 * accent colour when pinned; changes at once, moves the item in the list, then saves.
 */
export function PinButton({ kind, slug, pinned }: { kind: "snippets" | "notes"; slug: string; pinned: boolean }) {
  const list = useOptionalList();
  const [shown, setShown] = useOptimistic(pinned);
  const [, startTransition] = useTransition();
  const label = shown ? "Unpin" : "Pin to top";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={shown}
      title={label}
      onClick={() =>
        startTransition(async () => {
          setShown(!shown);
          list?.pin(slug, !shown);
          await setPinned(kind, slug, !shown);
        })
      }
      className={`grid size-[34px] shrink-0 place-items-center rounded-md border transition ${
        shown ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15" : "border-line text-muted hover:border-muted hover:text-text"
      }`}
    >
      <PinIcon className={`size-4 ${shown ? "fill-current" : ""}`} />
    </button>
  );
}
