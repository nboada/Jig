import Link from "next/link";
import { newItemButton } from "@/components/Button";
import { PlusIcon } from "@/components/NavIcons";
import { LanguageFilter, SearchInput } from "@/components/SearchInput";
import { SortSelect } from "@/components/SortSelect";
import { ViewToggle } from "@/components/ViewToggle";
import type { Section } from "@/lib/prefs";
import type { Sort } from "@/lib/sort";

export function GridHead({
  section,
  label,
  count,
  sort,
  placeholder,
  newLabel,
  languageFilter = false,
  note,
  tags,
  activeTag,
  tagHref,
  hiddenTag,
}: {
  section: Section;
  label: string;
  count: number;
  sort: Sort;
  placeholder: string;
  newLabel: string;
  languageFilter?: boolean;
  note?: string;
  tags: { tag: string; count: number }[];
  activeTag?: string;
  tagHref: (tag: string | undefined) => string;
  hiddenTag?: string;
}) {
  const controls = (
    <>
      <ViewToggle view="grid" section={section} />
      <Link href={`/${section}/new`} aria-label={`${newLabel} (N)`} title={`${newLabel} (N)`} className={newItemButton}>
        <PlusIcon className="size-4" />
      </Link>
    </>
  );

  return (
    <div className="space-y-4">
      <form
        action={`/${section}`}
        className="space-y-2 rounded-xl border border-line bg-panel p-3 lg:flex lg:items-center lg:gap-3 lg:space-y-0"
      >
        <div className="flex items-center justify-between gap-2 pl-0.5 lg:mr-auto lg:justify-start lg:gap-3">
          <span className="engraved">
            <span className="text-text-2">{label}</span>
            {` · ${count >= 100 ? "100+" : count}`}
          </span>
          <SortSelect sort={sort} section={section} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 lg:flex-nowrap">
          <div className="flex min-w-0 flex-1 lg:w-80 lg:flex-none">
            <SearchInput placeholder={placeholder} />
          </div>
          {hiddenTag && <input type="hidden" name="tag" value={hiddenTag} />}
          {languageFilter ? (
            <div className="flex basis-full items-center gap-1.5 lg:basis-auto">
              <LanguageFilter className="min-w-0 flex-1 lg:w-40 lg:flex-none" />
              {controls}
            </div>
          ) : (
            controls
          )}
        </div>
      </form>
      {note && <p className="text-ui text-muted">{note}</p>}
      {tags.length > 0 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
          {tags.map(({ tag, count: n }) => {
            const active = activeTag === tag;
            return (
              <Link
                key={tag}
                href={tagHref(active ? undefined : tag)}
                className={`h-7 rounded-md border px-2 font-mono text-meta leading-[26px] transition ${
                  active ? "border-accent-line bg-accent-soft text-text" : "border-line text-muted hover:border-line-strong hover:text-text"
                }`}
              >
                {`#${tag} `}
                <span className="text-faint">{n}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
