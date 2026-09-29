import type { Metadata } from "next";
import Link from "next/link";
import { LanguageIcon } from "@/components/LanguageIcon";
import { LanguageFilter, SearchInput } from "@/components/SearchInput";
import { ViewToggle } from "@/components/ViewToggle";
import { getDb } from "@/lib/db";
import { languageLabel } from "@/lib/languages";
import { listSnippets, listTags } from "@/lib/snippets";
import { timeAgo } from "@/lib/format";
import { getView } from "@/lib/view";

export const metadata: Metadata = { title: "Snippets" };

type Search = { q?: string; lang?: string; tag?: string };

function href(current: Search, change: Search) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...change })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/snippets?${query}` : "/snippets";
}

export default async function SnippetsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const db = await getDb();
  const [snippets, tags, view] = await Promise.all([
    listSnippets(db, { query: search.q, language: search.lang, tag: search.tag }),
    listTags(db),
    getView(),
  ]);
  const filtered = Boolean(search.q || search.lang || search.tag);

  return (
    <div className="space-y-6">
      <form className="flex flex-col gap-3 sm:flex-row" action="/snippets">
        <SearchInput placeholder="Search titles, tags and code" />
        <div className="flex gap-3">
          <LanguageFilter className="min-w-0 flex-1 sm:w-48 sm:flex-none" />
          {search.tag && <input type="hidden" name="tag" value={search.tag} />}
          <ViewToggle view={view} />
          <Link href="/snippets/new" className="flex shrink-0 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-ink">
            New snippet
            <kbd className="ml-2 hidden rounded border border-accent-ink/25 px-1 font-sans text-[10px] leading-4 opacity-70 sm:inline">N</kbd>
             
          </Link>
        </div>
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

      {snippets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
          {filtered ? (
            <>
              <p className="text-muted">Nothing matches that search.</p>
              <Link href="/snippets" className="mt-3 inline-block text-sm text-accent hover:underline">
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">Your library is empty</p>
              <p className="mt-1 text-sm text-muted">
                Add a snippet here, or ask an agent to save one once it is connected.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <Link href="/snippets/new" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
                  New snippet
                </Link>
                <Link href="/connect" className="rounded-md border border-line px-4 py-2 text-sm hover:border-muted">
                  Connect an agent
                </Link>
              </div>
            </>
          )}
        </div>
      ) : view === "list" ? (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
          {snippets.map((s) => (
            <li key={s.slug}>
              <Link href={`/snippets/${s.slug}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-raised">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-medium">{s.title}</h2>
                  {s.description && <p className="mt-0.5 truncate text-[13px] text-text/70">{s.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1.5 text-text/85">
                    <LanguageIcon language={s.language} className="size-3.5" />
                    {languageLabel(s.language)}
                  </span>
                  <span className="hidden sm:inline">
                    {`${s.fileNames.length} file${s.fileNames.length === 1 ? "" : "s"}`}
                  </span>
                  <span className="hidden md:inline">{timeAgo(s.updatedAt)}</span>
                  <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px]">{`v${s.version}`}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snippets.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/snippets/${s.slug}`}
                className="flex h-full flex-col rounded-lg border border-line bg-panel p-4 transition hover:border-muted"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium leading-snug">{s.title}</h2>
                  <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    {`v${s.version}`}
                  </span>
                </div>
                {s.description && <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-text/70">{s.description}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted">
                  <span className="flex items-center gap-1.5 text-text/85">
                    <LanguageIcon language={s.language} className="size-3.5" />
                    {languageLabel(s.language)}
                  </span>
                  <span>
                    {`${s.fileNames.length} file${s.fileNames.length === 1 ? "" : "s"}`}
                  </span>
                  <span>{timeAgo(s.updatedAt)}</span>
                  {s.tags.slice(0, 3).map((t) => (
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
