"use client";

import { useState } from "react";
import { iconButton } from "@/components/Button";
import { CopyButton } from "@/components/CopyButton";
import { EyeIcon, EyeOffIcon, LockIcon } from "@/components/NavIcons";

/** A shared credential's secret: masked until the viewer asks to see it. */
export function SharedSecret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-1">
      {shown ? (
        <span className="min-w-0 flex-1 font-mono text-ui break-all">{value}</span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2 font-mono text-ui tracking-widest text-faint">
          •••• •••• ••••
          <LockIcon className="size-3.5" />
        </span>
      )}
      <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? "Hide" : "Reveal"} title={shown ? "Hide" : "Reveal"} className={iconButton()}>
        {shown ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
      <CopyButton value={value} iconOnly />
    </div>
  );
}
