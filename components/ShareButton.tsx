"use client";

import { useState } from "react";
import { ShareIcon } from "@/components/NavIcons";
import { ShareDialog } from "@/components/ShareDialog";
import type { ShareKind } from "@/lib/shares";

/** The item page's Share button. */
export function ShareButton({ kind, slug, title }: { kind: ShareKind; slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[34px] items-center gap-1.5 rounded-md border border-line px-3 hover:border-muted"
      >
        <ShareIcon className="size-3.5" />
        Share
      </button>
      <ShareDialog kind={kind} slug={slug} title={title} open={open} onOpenChange={setOpen} />
    </>
  );
}
