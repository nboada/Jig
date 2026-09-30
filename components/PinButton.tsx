"use client";

import { useOptimistic, useTransition } from "react";
import { setPinned } from "@/app/actions";
import { iconButton } from "@/components/Button";
import { useOptionalList } from "@/components/ListContext";
import { PinIcon } from "@/components/NavIcons";
import { toast } from "@/components/Toaster";
import { Tip } from "@/components/Tooltip";

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
            const result = await setPinned(kind, slug, !shown);
            if (result.error) {
              list?.pin(slug, shown);
              toast.error(result.error);
            } else toast.success(shown ? "Unpinned" : "Pinned to top");
          })
        }
        className={iconButton({ className: shown ? "text-accent hover:text-accent" : "" })}
      >
        <PinIcon className={`size-4 ${shown ? "fill-current" : ""}`} />
      </button>
    </Tip>
  );
}
