import type { Metadata } from "next";
import Link from "next/link";
import { KeyMissing } from "@/components/KeyMissing";
import { SearchInput } from "@/components/SearchInput";
import { ViewToggle } from "@/components/ViewToggle";
import { listCredentials, listCredentialTags } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { getView } from "@/lib/view";

export const metadata: Metadata = { title: "Credentials" };

type Search = { q?: string; tag?: string };

function href(current: Search, change: Search) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...change })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/credentials?${query}` : "/credentials";
}

export default async function CredentialsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!encryptionReady()) return <KeyMissing />;
  const search = await searchParams;
  const db = await getDb();
  const [credentials, tags, view] = await Promise.all([
    listCredentials(db, { query: search.q, tag: search.tag }),
    listCredentialTags(db),
    getView(),
  ]);
  const filtered = Boolean(search.q || search.tag);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credentials</h1>
        <p className="mt-1 text-sm text-muted">Only visible here. Agents connected over MCP can never read these.</p>
      </div>

      <form className="flex gap-3" action="/credentials">
        <SearchInput placeholder="Search titles, URLs and labels" />
        {search.tag && <input type="hidden" name="tag" value={search.tag} />}
        <ViewToggle view={view} />
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

      {credentials.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
          {filtered ? (
            <>
              <p className="text-muted">Nothing matches that search.</p>
              <Link href="/credentials" className="mt-3 inline-block text-sm text-accent hover:underline">
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No credentials yet</p>
              <Link
                href="/credentials/new"
                className="mt-5 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
              >
                New credential
              </Link>
            </>
          )}
        </div>
      ) : view === "list" ? (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
          {credentials.map((c) => (
            <li key={c.slug}>
              <Link href={`/credentials/${c.slug}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-raised">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-medium">{c.title}</h2>
                  {c.url && <p className="mt-0.5 truncate font-mono text-xs text-muted">{c.url}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                  <span className="hidden max-w-60 truncate text-sm text-text/75 sm:inline">{c.labels.join(" · ")}</span>
                  <span className="hidden md:inline">{timeAgo(c.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {credentials.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/credentials/${c.slug}`}
                className="flex h-full flex-col rounded-lg border border-line bg-panel p-4 transition hover:border-muted"
              >
                <h2 className="font-medium leading-snug">{c.title}</h2>
                {c.url && <p className="mt-1 truncate font-mono text-xs text-muted">{c.url}</p>}
                <p className="mt-3 text-sm text-text/75">{c.labels.join(" · ")}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted">
                  <span>{timeAgo(c.updatedAt)}</span>
                  {c.tags.slice(0, 3).map((t) => (
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
