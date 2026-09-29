import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/Button";
import { Card } from "@/components/Card";
import { LockIcon } from "@/components/NavIcons";
import { EmptyState } from "@/components/EmptyState";
import { GridHead } from "@/components/GridHead";
import { ItemMenu } from "@/components/ItemMenu";
import { Kbd } from "@/components/Kbd";
import { Meta } from "@/components/Meta";
import { PickPane } from "@/components/PickPane";
import { getDb } from "@/lib/db";
import { timeAgoShort } from "@/lib/format";
import { listNotes, listNoteTags } from "@/lib/notes";
import { getListPrefs } from "@/lib/view";

export const metadata: Metadata = { title: "Notes" };

type Search = { q?: string; tag?: string; sort?: string };

function href(current: Search, change: Search) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...change })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/notes?${query}` : "/notes";
}

export default async function NotesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const { view, sort } = await getListPrefs("notes", search.sort);
  // In list view the layout shows the notes in a column; this pane waits for a pick.
  if (view === "list") return <PickPane noun="note" />;
  const db = await getDb();
  const [notes, tags] = await Promise.all([
    listNotes(db, { query: search.q, tag: search.tag, sort }),
    listNoteTags(db),
  ]);
  const filtered = Boolean(search.q || search.tag);

  return (
    <div className="space-y-6">
      <GridHead
        section="notes"
        label="Notes"
        count={notes.length}
        sort={sort}
        placeholder="Search notes"
        newLabel="New note"
        tags={tags}
        activeTag={search.tag}
        tagHref={(tag) => href(search, { tag })}
        hiddenTag={search.tag}
      />

      {notes.length === 0 ? (
        filtered ? (
          <EmptyState
            title={search.q ? `Nothing matches “${search.q}”` : "Nothing matches this tag"}
            actions={
              <Link href="/notes" className={button({ variant: "ghost" })}>
                Clear filters
              </Link>
            }
          >
            Search looks in titles, tags and the whole note.
          </EmptyState>
        ) : (
          <EmptyState
            title="No notes yet"
            actions={
              <Link href="/notes/new" className={button({ variant: "primary" })}>
                New note
                <Kbd onAccent>N</Kbd>
              </Link>
            }
          >
            Write one here, or ask an agent to save one.
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notes.map((n) => (
            <li key={n.slug}>
              <ItemMenu kind="notes" slug={n.slug} title={n.title} pinned={n.pinned} locked={n.locked}>
                <Card
                  href={`/notes/${n.slug}`}
                  kicker={
                    n.locked ? (
                      <>
                        <LockIcon className="size-3" />
                        Note · Locked
                      </>
                    ) : (
                      "Note"
                    )
                  }
                  pinned={n.pinned}
                  title={n.title}
                  body={n.excerpt}
                  meta={
                    <Meta>
                      {[
                        <span key="v" className="text-text-2">{`v${n.version}`}</span>,
                        <span key="t" suppressHydrationWarning>
                          {timeAgoShort(n.updatedAt)}
                        </span>,
                        ...n.tags.slice(0, 2).map((t) => `#${t}`),
                      ]}
                    </Meta>
                  }
                />
              </ItemMenu>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
