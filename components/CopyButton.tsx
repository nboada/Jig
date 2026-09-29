"use client";

import { useState } from "react";
import { button, iconButton } from "@/components/Button";
import { CheckIcon, CopyIcon } from "@/components/NavIcons";
import { Tip } from "@/components/Tooltip";

/**
 * Copies `value`. With a label it's a small ghost button that reads "Copied" for a moment, at a
 * fixed width so nothing beside it moves; `iconOnly` makes it a square icon button.
 */
export function CopyButton({ value, label = "Copy", iconOnly = false }: { value: string; label?: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  const Icon = copied ? CheckIcon : CopyIcon;
  if (iconOnly) {
    return (
      <Tip label={copied ? "Copied" : label}>
        <button type="button" onClick={copy} aria-label={copied ? "Copied" : label} className={iconButton({ className: copied ? "text-accent" : "" })}>
          <Icon className="size-4" />
        </button>
      </Tip>
    );
  }
  return (
    <button type="button" onClick={copy} className={button({ variant: "ghost", size: "sm", className: "min-w-[5.25rem] justify-start" })}>
      <Icon className={`size-3.5 ${copied ? "text-accent" : ""}`} />
      {copied ? "Copied" : label}
    </button>
  );
}
