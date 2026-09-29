import Link from "next/link";
import { button } from "@/components/Button";
import { Kbd } from "@/components/Kbd";
import { PlusIcon } from "@/components/NavIcons";
import { LanguageFilter, SearchInput } from "@/components/SearchInput";
import { SortSelect } from "@/components/SortSelect";
import { ViewToggle } from "@/components/ViewToggle";
import type { Section } from "@/lib/prefs";
import type { Sort } from "@/lib/sort";

/**
 * The head of a section in grid layout: its engraved name and count, then search, filters, sort,
 * layout and New, then the tag chips. The same controls as the split view's list column.
 */
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
  /** A line under the head, like Credentials' "agents can never read these". */
  note?: string;
  tags: { tag: string; count: number }[];
  activeTag?: string;
  tagHref: (tag: string | undefined) => string;
  /** The tag filter, kept when the search form submits. */
  hiddenTag?: string;
}) {
  return (
    <div className="space-y-4">
      <form action={`/${section}`} className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-baseline gap-2 lg:mr-auto">
          <span className="engraved text-text-2">{label}</span>
          <span className="engraved">{count >= 100 ? "100+" : count}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 sm:w-80 sm:flex-none">
            <SearchInput placeholder={placeholder} />
          </div>
          {languageFilter && <LanguageFilter className="w-40" />}
          {hiddenTag && <input type="hidden" name="tag" value={hiddenTag} />}
          <SortSelect sort={sort} section={section} />
          <ViewToggle view="grid" section={section} />
          <Link href={`/${section}/new`} className={button({ variant: "primary" })} title={`${newLabel} (N)`}>
            <PlusIcon className="size-4" />
            {newLabel}
            <Kbd onAccent className="hidden sm:inline">
              N
            </Kbd>
          </Link>
        </div>
      </form>
      {note && <p className="text-ui text-muted">{note}</p>}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
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
