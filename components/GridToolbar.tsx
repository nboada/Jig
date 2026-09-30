"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { button } from "@/components/Button";
import { Kbd } from "@/components/Kbd";
import { LanguageSelect } from "@/components/LanguageSelect";
import { PlusIcon, SearchIcon } from "@/components/NavIcons";
import { ViewToggle } from "@/components/ViewToggle";
import type { Section } from "@/lib/prefs";

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
      className="mb-6 hidden gap-2 sm:flex sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        go("q", query.trim());
      }}
    >
      <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-well px-2.5 text-faint transition focus-within:border-line-strong sm:max-w-sm">
        <SearchIcon className="size-3.5" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-ui text-text outline-none placeholder:text-faint"
        />
      </label>
      <div className="flex items-center gap-2 sm:ml-auto">
        {languageFilter && (
          <LanguageSelect size="sm" className="w-40" value="" onChange={(language) => go("lang", language)} allLabel="All languages" />
        )}
        <ViewToggle view="grid" section={section} />
        <Link href={`${base}/new`} className={button({ variant: "primary" })} title={`${newLabel} (N)`}>
          <PlusIcon className="size-4" />
          {newLabel}
          <Kbd onAccent className="hidden sm:inline">
            N
          </Kbd>
        </Link>
      </div>
    </form>
  );
}
