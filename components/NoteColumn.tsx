"use client";

import { searchNoteSlugs } from "@/app/actions";
import { ListColumn, ListFilters } from "@/components/SplitList";
import { LockIcon } from "@/components/NavIcons";
import { timeAgoShort } from "@/lib/format";
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

export function NoteColumn() {
  return (
    <ListColumn<NoteSummary>
      noun="note"
      label="Notes"
      placeholder="Search notes"
      newLabel="New note"
      renderRow={(n) => (
        <>
          <span className="flex items-center gap-1.5 text-ui font-medium text-text group-aria-[current=page]:text-accent">
            <span className="truncate">{n.title}</span>
            {n.locked && <LockIcon className="size-3 shrink-0 text-muted" />}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-meta text-muted">
            {/* Relative times can tick over between the server render and the browser's. */}
            <span className="shrink-0" suppressHydrationWarning>
              {timeAgoShort(n.updatedAt)}
            </span>
            {n.locked ? (
              <span className="font-sans text-faint">Locked</span>
            ) : (
              n.excerpt && <span className="truncate font-sans text-text-2/80">{n.excerpt}</span>
            )}
          </span>
        </>
      )}
    />
  );
}
