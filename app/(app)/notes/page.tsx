import type { Metadata } from "next";
import Link from "next/link";
import { SearchInput } from "@/components/SearchInput";
import { ViewToggle } from "@/components/ViewToggle";
import { getDb } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { listNotes, listNoteTags } from "@/lib/notes";
import { getView } from "@/lib/view";

export const metadata: Metadata = { title: "Notes" };

type Search = { q?: string; tag?: string };

function href(current: Search, change: Search) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...change })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/notes?${query}` : "/notes";
}

export default async function NotesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const db = await getDb();
  const [notes, tags, view] = await Promise.all([
    listNotes(db, { query: search.q, tag: search.tag }),
    listNoteTags(db),
    getView(),
  ]);
  const filtered = Boolean(search.q || search.tag);

  return (
    <div className="space-y-6">
      <form className="flex gap-3" action="/notes">
        <SearchInput placeholder="Search notes" />
        {search.tag && <input type="hidden" name="tag" value={search.tag} />}
        <ViewToggle view={view} />
        <Link href="/notes/new" className="flex shrink-0 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-ink">
          New note
          <kbd className="ml-2 hidden rounded border border-accent-ink/25 px-1 font-sans text-[10px] leading-4 opacity-70 sm:inline">N</kbd>
           
        </Link>
      </form>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map(({ tag, count }) => {
            const active = search.tag === tag;
            return (
              <Link
                key={tag}
                href={href(search, { tag: active ? undefined : tag })}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-text"
                }`}
              >
                {`${tag} `}<span className="opacity-60">{count}</span>
              </Link>
            );
          })}
        </div>
      )}

      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
          {filtered ? (
            <>
              <p className="text-muted">Nothing matches that search.</p>
              <Link href="/notes" className="mt-3 inline-block text-sm text-accent hover:underline">
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No notes yet</p>
              <p className="mt-1 text-sm text-muted">Write one here, or ask an agent to save one.</p>
              <Link
                href="/notes/new"
                className="mt-5 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
              >
                New note
              </Link>
            </>
          )}
        </div>
      ) : view === "list" ? (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
          {notes.map((n) => (
            <li key={n.slug}>
              <Link href={`/notes/${n.slug}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-raised">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-medium">{n.title}</h2>
                  {n.excerpt && <p className="mt-0.5 truncate text-[13px] text-text/70">{n.excerpt}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                  <span className="hidden sm:inline">{timeAgo(n.updatedAt)}</span>
                  <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px]">{`v${n.version}`}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <li key={n.slug}>
              <Link
                href={`/notes/${n.slug}`}
                className="flex h-full flex-col rounded-lg border border-line bg-panel p-4 transition hover:border-muted"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium leading-snug">{n.title}</h2>
                  <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    {`v${n.version}`}
                  </span>
                </div>
                {n.excerpt && <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-text/70">{n.excerpt}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted">
                  <span>{timeAgo(n.updatedAt)}</span>
                  {n.tags.slice(0, 3).map((t) => (
                    <span key={t}>{`#${t}`}</span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
