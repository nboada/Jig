"use client";

import { searchSnippetSlugs } from "@/app/actions";
import { LanguageIcon } from "@/components/LanguageIcon";
import { PinIcon } from "@/components/NavIcons";
import { ListColumn, ListFilters, ListToolbar } from "@/components/SplitList";
import { timeAgo } from "@/lib/format";
import type { SnippetSummary } from "@/lib/snippets";
import type { Sort } from "@/lib/sort";

/** What a snippet can be found by in the browser; code matches come from the server. */
const snippetText = (s: SnippetSummary) => [s.title, s.slug, s.description, s.tags.join(" "), s.fileNames.join(" ")].join(" ");

export function SnippetFilters({ snippets, sort, children }: { snippets: SnippetSummary[]; sort: Sort; children: React.ReactNode }) {
  return (
    <ListFilters items={snippets} sort={sort} section="snippets" base="/snippets" text={snippetText} search={searchSnippetSlugs}>
      {children}
    </ListFilters>
  );
}

export function SnippetToolbar() {
  return <ListToolbar placeholder="Search titles, tags and code" newLabel="New snippet" languageFilter />;
}

export function SnippetColumn() {
  return (
    <ListColumn<SnippetSummary>
      noun="snippet"
      renderRow={(s) => (
        <>
          <span className="flex items-center gap-1.5 text-sm font-medium group-aria-[current=page]:text-accent">
            <span className="truncate">{s.title}</span>
            {s.pinned && <PinIcon className="size-3 shrink-0 text-muted" />}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <LanguageIcon language={s.language} className="size-3" />
            {/* Relative times can tick over between the server render and the browser's. */}
            <span className="shrink-0" suppressHydrationWarning>
              {timeAgo(s.updatedAt)}
            </span>
            {s.description && <span className="truncate text-text/60">{s.description}</span>}
          </span>
        </>
      )}
    />
  );
}
