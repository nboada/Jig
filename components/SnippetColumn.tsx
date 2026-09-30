"use client";

import { searchSnippetSlugs } from "@/app/actions";
import { LanguageIcon } from "@/components/LanguageIcon";
import { ListColumn, ListFilters } from "@/components/SplitList";
import { timeAgoShort } from "@/lib/format";
import type { SnippetSummary } from "@/lib/snippets";
import type { Sort } from "@/lib/sort";

const snippetText = (s: SnippetSummary) => [s.title, s.slug, s.description, s.tags.join(" "), s.fileNames.join(" ")].join(" ");

export function SnippetFilters({ snippets, sort, children }: { snippets: SnippetSummary[]; sort: Sort; children: React.ReactNode }) {
  return (
    <ListFilters items={snippets} sort={sort} section="snippets" base="/snippets" text={snippetText} search={searchSnippetSlugs}>
      {children}
    </ListFilters>
  );
}

export function SnippetColumn() {
  return (
    <ListColumn<SnippetSummary>
      noun="snippet"
      label="Snippets"
      placeholder="Search titles, tags and code"
      newLabel="New snippet"
      languageFilter
      renderRow={(s) => (
        <>
          <span className="block truncate text-body font-medium text-text group-aria-[current=page]:text-accent">{s.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-meta text-muted">
            <LanguageIcon language={s.language} className="size-3 shrink-0" />
            <span className="shrink-0" suppressHydrationWarning>
              {timeAgoShort(s.updatedAt)}
            </span>
            {s.description && <span className="truncate font-sans text-text-2/80">{s.description}</span>}
          </span>
        </>
      )}
    />
  );
}
