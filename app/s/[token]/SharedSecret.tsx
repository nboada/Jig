"use client";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";

/** A shared credential's secret: masked until the viewer asks to see it. */
export function SharedSecret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 break-all font-mono text-sm">{shown ? value : "••••••••••••"}</span>
      <button
        type="button"
        onClick={() => setShown(!shown)}
        className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs text-muted transition hover:border-muted hover:text-text"
      >
        {shown ? "Hide" : "Reveal"}
      </button>
      <CopyButton value={value} />
    </div>
  );
}
