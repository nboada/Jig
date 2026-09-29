"use client";

import * as Select from "@radix-ui/react-select";
import { LanguageIcon } from "@/components/LanguageIcon";
import { LANGUAGE_CHOICES, languageFamily, languageLabel } from "@/lib/languages";

// Radix reserves the empty string for "no selection", so "every language" travels as this sentinel.
const ALL = "all";

/**
 * A language picker with brand icons. It lists families (TypeScript, JSX and TSX sit under
 * JavaScript), so a value like "tsx" shows as JavaScript and is kept until another family is
 * picked. With `allLabel`, it offers an extra first option that reports "" (no filter).
 */
export function LanguageSelect({
  value,
  onChange,
  allLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  className?: string;
}) {
  const current = value ? languageFamily(value) : allLabel ? ALL : "";
  return (
    <Select.Root value={current} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
      <Select.Trigger
        aria-label="Language"
        className={`flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-left outline-none transition hover:border-muted focus-visible:border-accent data-[state=open]:border-accent ${className}`}
      >
        <LanguageIcon language={current} />
        <span className="min-w-0 flex-1 truncate">{current === ALL ? allLabel : languageLabel(current)}</span>
        <Select.Icon className="text-muted">
          <Chevron />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-panel shadow-xl shadow-black/40"
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
      className="flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[highlighted]:bg-raised data-[state=checked]:text-text relative text-text/85"
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
