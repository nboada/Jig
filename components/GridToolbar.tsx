"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LanguageSelect } from "@/components/LanguageSelect";
import { ViewToggle } from "@/components/ViewToggle";
import type { Section } from "@/lib/prefs";

/**
 * In grid layout, the list page has its own toolbar; this puts the same one above an item, a new
 * item or an edit, so search, the layout toggle and New stay at hand. Searching or picking a
 * language goes back to the grid with that filter. History pages keep the full width, as in the
 * split view.
 */
export function GridToolbar({
  section,
  placeholder,
  newLabel,
  languageFilter = false,
}: {
  section: Section;
  placeholder: string;
  newLabel: string;
  languageFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const base = `/${section}`;
  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  const onItemPage = rest.length === 1 || (rest.length === 2 && rest[1] === "edit");
  if (!onItemPage) return null;

  const go = (param: string, value: string) => router.push(value ? `${base}?${param}=${encodeURIComponent(value)}` : base);

  return (
    <form
      className="mb-6 flex flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        go("q", query.trim());
      }}
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent"
      />
      <div className="flex gap-3">
        {languageFilter && (
          <LanguageSelect
            className="min-w-0 flex-1 sm:w-48 sm:flex-none"
            value=""
            onChange={(language) => go("lang", language)}
            allLabel="All languages"
          />
        )}
        <ViewToggle view="grid" section={section} />
        <Link
          href={`${base}/new`}
          className="flex shrink-0 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-ink hover:brightness-110"
        >
          {newLabel}
          <kbd className="ml-2 hidden rounded border border-accent-ink/25 px-1 font-sans text-[10px] leading-4 opacity-70 sm:inline">N</kbd>
        </Link>
      </div>
    </form>
  );
}
