"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemMenu } from "@/components/ItemMenu";
import { ListContext, useList, type Item } from "@/components/ListContext";
import { LanguageSelect } from "@/components/LanguageSelect";
import { SortSelect } from "@/components/SortSelect";
import { ViewToggle } from "@/components/ViewToggle";
import { filterItems } from "@/lib/filter";
import { countLabel } from "@/lib/format";
import { isPlainKey, type Section } from "@/lib/prefs";
import { sortItems, type Sort } from "@/lib/sort";

/**
 * The split view's shared pieces for any list section (snippets, notes): the filters, the
 * toolbar above both columns, and the list column. Each kind wraps these with its own row
 * layout and search text (functions can't be passed in from a server component).
 */


/**
 * Holds every item (sorted on the server) and the filters. Filtering happens in the browser as
 * you type; `search` finds content matches on the server a moment later.
 */
export function ListFilters<T extends Item>({
  items,
  sort: initialSort,
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
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [tag, setTag] = useState("");
  // Links from elsewhere (home's "See all", a tag on an item) arrive with ?q=, ?lang= or ?tag=.
  // Read once from the address after mounting, not with useSearchParams: that needs a Suspense
  // boundary around the layout, and pages inside one never finished mounting (their effects,
  // like the code editor's, never ran).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get("q") ?? "");
    setLanguage(params.get("lang") ?? "");
    setTag(params.get("tag") ?? "");
  }, []);
  const [contentHits, setContentHits] = useState<Set<string>>();
  // Sorting, hiding and pinning happen here first, so the column changes the moment you ask.
  const [sort, setSort] = useState(initialSort);
  type Edits = { items: T[]; hidden: Set<string>; pins: Map<string, boolean> };
  const [edits, setEdits] = useState<Edits>({ items, hidden: new Set(), pins: new Map() });
  // Fresh items from the server supersede any edits made ahead of it.
  const current = edits.items === items ? edits : null;

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

  const visible = useMemo(() => {
    const shown = current
      ? items
          .filter((item) => !current.hidden.has(item.slug))
          .map((item) => (current.pins.has(item.slug) ? { ...item, pinned: current.pins.get(item.slug) } : item))
      : items;
    return sortItems(filterItems(shown, { query, language, tag }, text, contentHits), sort);
  }, [items, current, query, language, tag, text, contentHits, sort]);

  const edit = useCallback(
    (change: (edits: Edits) => void) =>
      setEdits((previous) => {
        const next: Edits =
          previous.items === items
            ? { items, hidden: new Set(previous.hidden), pins: new Map(previous.pins) }
            : { items, hidden: new Set(), pins: new Map() };
        change(next);
        return next;
      }),
    [items],
  );
  const hide = useCallback((slug: string) => edit((e) => void e.hidden.add(slug)), [edit]);
  const pin = useCallback((slug: string, pinned: boolean) => edit((e) => void e.pins.set(slug, pinned)), [edit]);

  return (
    <ListContext.Provider
      value={{ query, setQuery, language, setLanguage, tag, setTag, visible, sort, setSort, hide, pin, section, base }}
    >
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
 * is visible. `renderRow` draws an item's content inside its link; the link is a `group` with
 * aria-current="page" when selected, so rows can style their title with group-aria-[current=page].
 */
export function ListColumn<T extends Item>({
  noun,
  renderRow,
}: {
  noun: string;
  renderRow: (item: T) => React.ReactNode;
}) {
  const { visible, sort, setSort, section, base, query, language, tag, setTag } = useList();
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
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-panel md:sticky md:top-22 md:max-h-[calc(100dvh-7.5rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-line py-1.5 pr-1.5 pl-3">
        <p className="text-xs text-muted">
          {countLabel(visible.length, noun, 500)}
          {tag && (
            <button type="button" onClick={() => setTag("")} className="ml-2 rounded bg-raised px-1.5 py-0.5 text-text/85 hover:text-text">
              {`#${tag} ×`}
            </button>
          )}
        </p>
        <SortSelect sort={sort} section={section} onChange={setSort} />
      </div>

      <ul ref={listRef} className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {visible.map((item, index) => {
          const active = item.slug === selected;
          // A thin line under the pinned group, where the rest of the list begins.
          const afterPins = index > 0 && visible[index - 1].pinned && !item.pinned;
          return (
            <li key={item.slug} className={afterPins ? "mt-1.5 border-t border-line pt-1.5" : ""}>
              <ItemMenu kind={section} slug={item.slug} title={item.title} url={item.url} pinned={item.pinned}>
              <Link
                href={`${base}/${item.slug}`}
                aria-current={active ? "page" : undefined}
                className={`group block rounded-md px-3 py-2 transition ${active ? "bg-accent/10" : "hover:bg-raised/60"}`}
              >
                {renderRow(item as T)}
              </Link>
              </ItemMenu>
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
