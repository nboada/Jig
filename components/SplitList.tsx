"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LanguageSelect } from "@/components/LanguageSelect";
import { SortSelect } from "@/components/SortSelect";
import { ViewToggle } from "@/components/ViewToggle";
import { filterItems } from "@/lib/filter";
import { countLabel } from "@/lib/format";
import { isPlainKey, type Section } from "@/lib/prefs";
import type { Sort } from "@/lib/sort";

/**
 * The split view's shared pieces for any list section (snippets, notes): the filters, the
 * toolbar above both columns, and the list column. Each kind wraps these with its own row
 * layout and search text (functions can't be passed in from a server component).
 */

type Item = { slug: string; tags: string[]; language?: string };

type ListState = {
  query: string;
  setQuery: (value: string) => void;
  language: string;
  setLanguage: (value: string) => void;
  tag: string;
  setTag: (value: string) => void;
  visible: Item[];
  sort: Sort;
  section: Section;
  base: string;
};

const ListContext = createContext<ListState | null>(null);

function useList() {
  const list = useContext(ListContext);
  if (!list) throw new Error("ListToolbar and ListColumn need a ListFilters around them");
  return list;
}

/**
 * Holds every item (sorted on the server) and the filters. Filtering happens in the browser as
 * you type; `search` finds content matches on the server a moment later.
 */
export function ListFilters<T extends Item>({
  items,
  sort,
  section,
  base,
  text,
  search,
  children,
}: {
  items: T[];
  sort: Sort;
  section: Section;
  base: string;
  /** The words an item can be found by without asking the server: title, tags and the like. */
  text: (item: T) => string;
  search: (query: string) => Promise<string[]>;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  // Links from elsewhere (home's "See all", a tag on an item) arrive with ?q=, ?lang= or ?tag=.
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [language, setLanguage] = useState(params.get("lang") ?? "");
  const [tag, setTag] = useState(params.get("tag") ?? "");
  const [contentHits, setContentHits] = useState<Set<string>>();

  useEffect(() => {
    const q = query.trim();
    if (!q) return setContentHits(undefined);
    let current = true;
    const timer = setTimeout(async () => {
      const slugs = await search(q);
      if (current) setContentHits(new Set(slugs));
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, search]);

  const visible = useMemo(
    () => filterItems(items, { query, language, tag }, text, contentHits),
    [items, query, language, tag, text, contentHits],
  );

  return (
    <ListContext.Provider value={{ query, setQuery, language, setLanguage, tag, setTag, visible, sort, section, base }}>
      {children}
    </ListContext.Provider>
  );
}

/** The toolbar across both columns: search, an optional language filter, layout and New. */
export function ListToolbar({
  placeholder,
  newLabel,
  languageFilter = false,
}: {
  placeholder: string;
  newLabel: string;
  languageFilter?: boolean;
}) {
  const { query, setQuery, language, setLanguage, section, base } = useList();
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
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
          <LanguageSelect className="min-w-0 flex-1 sm:w-48 sm:flex-none" value={language} onChange={setLanguage} allLabel="All languages" />
        )}
        <ViewToggle view="list" section={section} />
        <Link
          href={`${base}/new`}
          className="flex shrink-0 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-ink hover:brightness-110"
        >
          {newLabel}
          <kbd className="ml-2 hidden rounded border border-accent-ink/25 px-1 font-sans text-[10px] leading-4 opacity-70 sm:inline">N</kbd>
        </Link>
      </div>
    </div>
  );
}

/**
 * The list column. It stays mounted while you move between items, and ↑/↓ step through what
 * is visible. `renderRow` draws an item's content inside its link.
 */
export function ListColumn<T extends Item>({
  noun,
  renderRow,
}: {
  noun: string;
  renderRow: (item: T) => React.ReactNode;
}) {
  const { visible, sort, section, base, query, language, tag, setTag } = useList();
  const router = useRouter();
  const pathname = usePathname();
  const selected = pathname.startsWith(`${base}/`) ? decodeURIComponent(pathname.slice(base.length + 1).split("/")[0]) : "";

  // ↑/↓ move through the list; the selected row scrolls into view.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const down = isPlainKey(event, "arrowdown");
      if (!down && !isPlainKey(event, "arrowup")) return;
      if (visible.length === 0) return;
      event.preventDefault();
      const at = visible.findIndex((item) => item.slug === selected);
      const next = at === -1 ? 0 : Math.min(Math.max(at + (down ? 1 : -1), 0), visible.length - 1);
      router.push(`${base}/${visible[next].slug}`);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, selected, router, base]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const filtered = Boolean(query.trim() || language || tag);

  return (
    <div className="flex flex-col gap-2 md:sticky md:top-22 md:h-[calc(100dvh-7.5rem)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {countLabel(visible.length, noun, 500)}
          {tag && (
            <button type="button" onClick={() => setTag("")} className="ml-2 rounded bg-raised px-1.5 py-0.5 text-text/85 hover:text-text">
              {`#${tag} ×`}
            </button>
          )}
        </p>
        <SortSelect sort={sort} section={section} />
      </div>

      <ul ref={listRef} className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1 pb-4">
        {visible.map((item) => {
          const active = item.slug === selected;
          return (
            <li key={item.slug}>
              <Link
                href={`${base}/${item.slug}`}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 transition ${active ? "bg-raised" : "hover:bg-raised/60"}`}
              >
                {renderRow(item as T)}
              </Link>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted">
            {filtered ? "Nothing matches." : `No ${noun}s yet. Press N to add one.`}
          </li>
        )}
      </ul>
    </div>
  );
}
