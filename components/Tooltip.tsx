"use client";

import * as Tooltip from "@radix-ui/react-tooltip";

/** Put once around the app so every tip shares one delay: the first waits, the next show at once. */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={400}>
      {children}
    </Tooltip.Provider>
  );
}

/**
 * A small label on hover for an icon-only button, styled like the menus. The child keeps its own
 * aria-label; this is for sighted mouse users, who otherwise only get the browser's slow title.
 */
export function Tip({ label, side = "bottom", children }: { label: string; side?: "top" | "bottom" | "left" | "right"; children: React.ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="menu-content z-50 rounded-md border border-line-strong bg-overlay px-2 py-1 text-meta text-text shadow-lg shadow-black/40"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
