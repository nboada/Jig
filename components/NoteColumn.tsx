"use client";

import { searchNoteSlugs } from "@/app/actions";
import { ListColumn, ListFilters, ListToolbar } from "@/components/SplitList";
import { timeAgo } from "@/lib/format";
import type { NoteSummary } from "@/lib/notes";
import type { Sort } from "@/lib/sort";

/** What a note can be found by in the browser; matches further into the text come from the server. */
const noteText = (n: NoteSummary) => [n.title, n.slug, n.tags.join(" "), n.excerpt].join(" ");

export function NoteFilters({ notes, sort, children }: { notes: NoteSummary[]; sort: Sort; children: React.ReactNode }) {
  return (
    <ListFilters items={notes} sort={sort} section="notes" base="/notes" text={noteText} search={searchNoteSlugs}>
      {children}
    </ListFilters>
  );
}

export function NoteToolbar() {
  return <ListToolbar placeholder="Search notes" newLabel="New note" />;
}

export function NoteColumn() {
  return (
    <ListColumn<NoteSummary>
      noun="note"
      renderRow={(n) => (
        <>
          <span className="block truncate text-sm font-medium">{n.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            {/* Relative times can tick over between the server render and the browser's. */}
            <span className="shrink-0" suppressHydrationWarning>
              {timeAgo(n.updatedAt)}
            </span>
            {n.excerpt && <span className="truncate text-text/60">{n.excerpt}</span>}
          </span>
        </>
      )}
    />
  );
}
