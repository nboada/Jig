"use client";

import * as Select from "@radix-ui/react-select";
import { LanguageIcon } from "@/components/LanguageIcon";
import { LANGUAGE_CHOICES, languageFamily, languageLabel } from "@/lib/languages";

const ALL = "all";

export function LanguageSelect({
  value,
  onChange,
  allLabel,
  size = "md",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const current = value ? languageFamily(value) : allLabel ? ALL : "";
  return (
    <Select.Root value={current} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
      <Select.Trigger
        aria-label="Language"
        className={`flex items-center gap-2 border border-line text-left outline-none transition hover:border-line-strong focus-visible:border-accent data-[state=open]:border-accent ${
          size === "sm" ? "h-8 rounded-lg bg-well px-2.5 text-ui" : "rounded-md bg-panel px-3 py-2"
        } ${className}`}
      >
        <LanguageIcon language={current} />
        <span className="min-w-0 flex-1 truncate">{current === ALL ? allLabel : languageLabel(current)}</span>
        {allLabel && value && (
          <span
            role="button"
            aria-label="Clear language filter"
            title="Clear"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange("");
            }}
            className="-mr-1 grid size-5 shrink-0 place-items-center rounded text-faint transition hover:bg-raised hover:text-text"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="size-3" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
        )}
        <Select.Icon className="text-faint">
          <Chevron />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="menu-content z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[max(var(--radix-select-trigger-width),12rem)] overflow-hidden rounded-lg border border-line-strong bg-overlay shadow-xl shadow-black/40"
        >
          <Select.Viewport className="p-1">
            {allLabel && <Option value={ALL} label={allLabel} />}
            {allLabel && <Select.Separator className="mx-1 my-1 h-px bg-line" />}
            {LANGUAGE_CHOICES.map((l) => (
              <Option key={l.id} value={l.id} label={l.label} />
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function Option({ value, label }: { value: string; label: string }) {
  return (
    <Select.Item
      value={value}
      className="relative flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md pr-8 pl-2.5 text-ui text-text-2 outline-none data-[highlighted]:bg-raised data-[state=checked]:text-text"
    >
      <LanguageIcon language={value} />
      <Select.ItemText>{label}</Select.ItemText>
      <Select.ItemIndicator className="absolute right-2 text-accent">
        <Check />
      </Select.ItemIndicator>
    </Select.Item>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
