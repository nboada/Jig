"use client";

import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { button } from "@/components/Button";
import { menuContentClass, menuItemClass } from "@/components/ItemActions";
import { field } from "@/components/SnippetForm";

export function SparkleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 2l.6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z" />
    </svg>
  );
}

/** The AI button: a box for the owner's own request, with the usual jobs below it as shortcuts. */
export function AiPrompt({
  working,
  disabled = false,
  title,
  placeholder,
  shortcuts,
  hint,
  onOpen,
  onAsk,
}: {
  working: boolean;
  disabled?: boolean;
  title: string;
  placeholder: string;
  shortcuts: { label: string; run: () => void }[];
  hint?: string;
  onOpen?: () => void;
  onAsk: (instruction: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");

  function ask() {
    const text = instruction.trim();
    if (!text) return;
    setOpen(false);
    onAsk(text);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen?.();
        setOpen(next);
      }}
    >
      <Popover.Trigger
        onMouseDown={(e) => e.preventDefault()}
        disabled={disabled || working}
        title={title}
        className={button({ variant: "ghost", size: "sm", className: "disabled:opacity-60 data-[state=open]:bg-raised data-[state=open]:text-text" })}
      >
        <SparkleIcon className={`size-3.5 ${working ? "animate-pulse text-accent" : ""}`} />
        {working ? "Working" : "AI"}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className={`${menuContentClass} w-[min(22rem,calc(100vw-2rem))]`} onCloseAutoFocus={(e) => e.preventDefault()}>
          <form
            className="space-y-2 p-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <textarea
              autoFocus
              rows={2}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask();
                }
              }}
              placeholder={placeholder}
              aria-label="What the AI should do"
              className={`${field} resize-none text-ui`}
            />
            <div className="flex justify-end">
              <button type="submit" disabled={!instruction.trim()} className={button({ variant: "primary", size: "sm", className: "disabled:opacity-50" })}>
                Go
              </button>
            </div>
          </form>
          <div className="my-1 h-px bg-line" />
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              onClick={() => {
                setOpen(false);
                shortcut.run();
              }}
              className={`${menuItemClass()} w-full text-left`}
            >
              {shortcut.label}
            </button>
          ))}
          {hint && <p className="px-2.5 pt-1 pb-1.5 text-meta text-faint">{hint}</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Asks for another change to the AI's answer, in the preview before it's used. */
export function RefineBar({ working, placeholder, onRefine }: { working: boolean; placeholder: string; onRefine: (instruction: string) => void }) {
  const [instruction, setInstruction] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!instruction.trim()) return;
        onRefine(instruction.trim());
        setInstruction("");
      }}
    >
      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={placeholder}
        aria-label="Ask for another change"
        className={`${field} text-ui`}
      />
      <button type="submit" disabled={working || !instruction.trim()} className={button({ className: "shrink-0 disabled:opacity-50" })}>
        {working ? "Working…" : "Redo"}
      </button>
    </form>
  );
}
