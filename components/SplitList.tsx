"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { iconButton } from "@/components/Button";
import { ItemMenu } from "@/components/ItemMenu";
import { Kbd } from "@/components/Kbd";
import { ListContext, useList, type Item } from "@/components/ListContext";
import { LanguageSelect } from "@/components/LanguageSelect";
import { SortSelect } from "@/components/SortSelect";
import { PinIcon, PlusIcon, SearchIcon } from "@/components/NavIcons";
import { ViewToggle } from "@/components/ViewToggle";
import { filterItems } from "@/lib/filter";
import { isPlainKey, type Section } from "@/lib/prefs";
import { sortItems, type Sort } from "@/lib/sort";

/**
 * The split view's shared pieces for any list section: the filters and the list column. Each
 * kind wraps these with its own row layout and search text (functions can't be passed in from a
 * server component).
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

/**
 * The list column. Its head holds the section's search, filters, sort, layout and New, so the
 * open item gets the whole height beside it. It stays mounted while you move between items, and
 * ↑/↓ step through what is visible. `renderRow` draws an item's content inside its link; the link
 * is a `group` with aria-current="page" when selected, so rows can style their title with
 * group-aria-[current=page].
 */
export function ListColumn<T extends Item>({
  noun,
  label,
  placeholder,
  newLabel,
  languageFilter = false,
  renderRow,
}: {
  noun: string;
  /** The section's name, engraved at the top of the column. */
  label: string;
  placeholder: string;
  newLabel: string;
  languageFilter?: boolean;
  renderRow: (item: T) => React.ReactNode;
}) {
  const { visible, sort, setSort, section, base, query, setQuery, language, setLanguage, tag, setTag } = useList();
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
  const controls = (
    <>
      <ViewToggle view="list" section={section} />
      <Link
        href={`${base}/new`}
        aria-label={`${newLabel} (N)`}
        title={`${newLabel} (N)`}
        className={iconButton({ size: "md", className: "border border-line text-text hover:border-line-strong" })}
      >
        <PlusIcon className="size-4" />
      </Link>
    </>
  );
  const hasPins = visible.some((item) => item.pinned);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel md:sticky md:top-(--pane-top) md:max-h-[calc(100dvh-var(--pane-top)-1.5rem)]">
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center justify-between gap-2 pl-0.5">
          <span className="engraved">
            <span className="text-text-2">{label}</span>
            {` · ${visible.length >= 500 ? "500+" : visible.length}`}
          </span>
          <SortSelect sort={sort} section={section} onChange={setSort} />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-well px-2.5 text-faint transition focus-within:border-line-strong">
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
          {/* Without a language filter, layout and New fit beside the search. */}
          {!languageFilter && controls}
        </div>
        {(languageFilter || tag) && (
          <div className="flex items-center gap-1.5">
            {languageFilter && (
              <LanguageSelect size="sm" className="min-w-0 flex-1" value={language} onChange={setLanguage} allLabel="All languages" />
            )}
            {tag && (
              <button
                type="button"
                onClick={() => setTag("")}
                title="Clear the tag filter"
                className="h-7 min-w-0 truncate rounded-md border border-accent-line bg-accent-soft px-2 font-mono text-meta text-text"
              >
                {`#${tag} ×`}
              </button>
            )}
            {languageFilter ? controls : <span className="flex-1" />}
          </div>
        )}
      </div>

      <ul ref={listRef} className="flex-1 overflow-y-auto p-1.5">
        {visible.map((item, index) => {
          const active = item.slug === selected;
          // Pinned items come first; label the two groups when there are both.
          const groupLabel = hasPins && index === 0 ? "pinned" : hasPins && visible[index - 1]?.pinned && !item.pinned ? "all" : null;
          return (
            <li key={item.slug}>
              {groupLabel && (
                <p className={`engraved flex items-center gap-1.5 px-2.5 pb-1 text-[10.5px] text-faint ${index === 0 ? "pt-1.5" : "pt-3"}`}>
                  {groupLabel === "pinned" && <PinIcon className="size-3 fill-current" />}
                  {groupLabel === "pinned" ? "Pinned" : "All"}
                </p>
              )}
              <ItemMenu kind={section} slug={item.slug} title={item.title} url={item.url} pinned={item.pinned}>
                <Link
                  href={`${base}/${item.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`group block rounded-lg px-2.5 py-2 transition ${active ? "bg-accent-soft" : "hover:bg-raised/60"}`}
                >
                  {renderRow(item as T)}
                </Link>
              </ItemMenu>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-10 text-center text-ui text-muted">
            {filtered ? "Nothing matches." : (
              <>
                {`No ${noun}s yet. Press `}
                <Kbd>N</Kbd>
                {" to add one."}
              </>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
