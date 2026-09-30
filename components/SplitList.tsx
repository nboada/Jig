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


export function ListFilters<T extends Item>({
  items,
  sort: initialSort,
  section,
  base,
  text,
  search,
  unlocked = false,
  children,
}: {
  items: T[];
  sort: Sort;
  section: Section;
  base: string;
  text: (item: T) => string;
  search: (query: string) => Promise<string[]>;
  unlocked?: boolean;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [tag, setTag] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get("q") ?? "");
    setLanguage(params.get("lang") ?? "");
    setTag(params.get("tag") ?? "");
  }, []);
  const [contentHits, setContentHits] = useState<Set<string>>();
  const [sort, setSort] = useState(initialSort);
  type Edits = { items: T[]; hidden: Set<string>; pins: Map<string, boolean>; locks: Map<string, boolean> };
  const [edits, setEdits] = useState<Edits>({ items, hidden: new Set(), pins: new Map(), locks: new Map() });
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
          .map((item) => (current.locks.has(item.slug) ? { ...item, locked: current.locks.get(item.slug) } : item))
      : items;
    return sortItems(filterItems(shown, { query, language, tag }, text, contentHits), sort);
  }, [items, current, query, language, tag, text, contentHits, sort]);

  const edit = useCallback(
    (change: (edits: Edits) => void) =>
      setEdits((previous) => {
        const next: Edits =
          previous.items === items
            ? { items, hidden: new Set(previous.hidden), pins: new Map(previous.pins), locks: new Map(previous.locks) }
            : { items, hidden: new Set(), pins: new Map(), locks: new Map() };
        change(next);
        return next;
      }),
    [items],
  );
  const hide = useCallback((slug: string) => edit((e) => void e.hidden.add(slug)), [edit]);
  const unhide = useCallback((slug: string) => edit((e) => void e.hidden.delete(slug)), [edit]);
  const pin = useCallback((slug: string, pinned: boolean) => edit((e) => void e.pins.set(slug, pinned)), [edit]);
  const lock = useCallback((slug: string, locked: boolean) => edit((e) => void e.locks.set(slug, locked)), [edit]);

  return (
    <ListContext.Provider
      value={{ query, setQuery, language, setLanguage, tag, setTag, visible, sort, setSort, hide, unhide, pin, lock, section, base, unlocked }}
    >
      {children}
    </ListContext.Provider>
  );
}

export function ListColumn<T extends Item>({
  noun,
  label,
  placeholder,
  newLabel,
  languageFilter = false,
  renderRow,
}: {
  noun: string;
  label: string;
  placeholder: string;
  newLabel: string;
  languageFilter?: boolean;
  renderRow: (item: T) => React.ReactNode;
}) {
  const { visible, sort, setSort, section, base, unlocked, query, setQuery, language, setLanguage, tag, setTag } = useList();
  const router = useRouter();
  const pathname = usePathname();
  const selected = pathname.startsWith(`${base}/`) ? decodeURIComponent(pathname.slice(base.length + 1).split("/")[0]) : "";

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
          const groupLabel = hasPins && index === 0 ? "pinned" : hasPins && visible[index - 1]?.pinned && !item.pinned ? "all" : null;
          return (
            <li key={item.slug}>
              {groupLabel && (
                <p className={`engraved flex items-center gap-1.5 px-2.5 pb-1 text-[10.5px] text-faint ${index === 0 ? "pt-1.5" : "pt-3"}`}>
                  {groupLabel === "pinned" && <PinIcon className="size-3 fill-current" />}
                  {groupLabel === "pinned" ? "Pinned" : "All"}
                </p>
              )}
              <ItemMenu kind={section} slug={item.slug} title={item.title} url={item.url} pinned={item.pinned} locked={item.locked} unlocked={unlocked}>
                <Link
                  href={`${base}/${item.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`group mb-[3px] block rounded-lg px-2.5 py-2 transition ${active ? "bg-accent-soft" : "hover:bg-raised/60"}`}
                >
                  {renderRow(item as T)}
                </Link>
              </ItemMenu>
            </li>
          );
        })}
        {visible.length >= 500 && (
          <li className="px-3 py-4 text-center text-meta text-muted">{`Showing the first 500 ${noun}s. Search in the grid view to reach the rest.`}</li>
        )}
        {visible.length === 0 && (
          <li className="px-3 py-10 text-center text-ui text-muted">
            {filtered ? "Nothing matches." : (
              <>
                {`No ${noun}s yet.`}
                <br />
                {"Press "}
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
