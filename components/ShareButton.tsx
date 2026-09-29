"use client";

import { useState } from "react";
import { iconButton } from "@/components/Button";
import { ShareIcon } from "@/components/NavIcons";
import { ShareDialog } from "@/components/ShareDialog";
import type { ShareKind } from "@/lib/shares";

/** The item page's Share button. */
export function ShareButton({ kind, slug, title }: { kind: ShareKind; slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Share" title="Share" className={iconButton()}>
        <ShareIcon className="size-4" />
      </button>
      <ShareDialog kind={kind} slug={slug} title={title} open={open} onOpenChange={setOpen} />
    </>
  );
}
