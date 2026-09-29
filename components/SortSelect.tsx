"use client";

import * as Select from "@radix-ui/react-select";
import { useRouter } from "next/navigation";
import { useSetParam } from "@/components/SearchInput";
import { savePref, type Section } from "@/lib/prefs";
import { SORTS, type Sort } from "@/lib/sort";

/** Picks the list order. Each page remembers its own in a cookie; a ?sort= in the URL is dropped on change. */
export function SortSelect({ sort, section }: { sort: Sort; section: Section }) {
  const router = useRouter();
  const { params, setParam } = useSetParam();
  function choose(next: string) {
    savePref("sort", section, next);
    if (params.has("sort")) setParam("sort", "");
    else router.refresh();
  }
  return (
    <Select.Root value={sort} onValueChange={choose}>
      <Select.Trigger
        aria-label="Sort"
        title="Sort"
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted outline-none transition hover:bg-raised hover:text-text data-[state=open]:bg-raised data-[state=open]:text-text"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
          <path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" />
        </svg>
        {/* Rendered directly: Radix only fills Select.Value once its items have mounted. */}
        <Select.Value>{SORTS.find((s) => s.id === sort)?.label}</Select.Value>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          align="end"
          className="z-50 min-w-44 overflow-hidden rounded-lg border border-line bg-panel shadow-xl shadow-black/40"
        >
          <Select.Viewport className="p-1">
            {SORTS.map((s) => (
              <Select.Item
                key={s.id}
                value={s.id}
                className="relative flex cursor-pointer select-none items-center rounded-md py-1.5 pr-8 pl-2 text-sm text-text/85 outline-none data-[highlighted]:bg-raised data-[state=checked]:text-text"
              >
                <Select.ItemText>{s.label}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-2 text-accent">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
