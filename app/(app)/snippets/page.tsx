import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { GridHead } from "@/components/GridHead";
import { ItemMenu } from "@/components/ItemMenu";
import { Kbd } from "@/components/Kbd";
import { LanguageIcon } from "@/components/LanguageIcon";
import { Meta } from "@/components/Meta";
import { PickPane } from "@/components/PickPane";
import { getDb } from "@/lib/db";
import { timeAgoShort } from "@/lib/format";
import { languageLabel } from "@/lib/languages";
import { listSnippets, listTags } from "@/lib/snippets";
import { getListPrefs } from "@/lib/view";

export const metadata: Metadata = { title: "Snippets" };

type Search = { q?: string; lang?: string; tag?: string; sort?: string };

function href(current: Search, change: Search) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...change })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/snippets?${query}` : "/snippets";
}

export default async function SnippetsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const { view, sort } = await getListPrefs("snippets", search.sort);
  // In list view the layout shows the snippets in a column; this pane waits for a pick.
  if (view === "list") return <PickPane noun="snippet" />;
  const db = await getDb();
  const [snippets, tags] = await Promise.all([
    listSnippets(db, { query: search.q, language: search.lang, tag: search.tag, sort }),
    listTags(db),
  ]);
  const filtered = Boolean(search.q || search.lang || search.tag);

  return (
    <div className="space-y-6">
      <GridHead
        section="snippets"
        label="Snippets"
        count={snippets.length}
        sort={sort}
        placeholder="Search titles, tags and code"
        newLabel="New snippet"
        languageFilter
        tags={tags}
        activeTag={search.tag}
        tagHref={(tag) => href(search, { tag })}
        hiddenTag={search.tag}
      />

      {snippets.length === 0 ? (
        filtered ? (
          <EmptyState
            title={search.q ? `Nothing matches “${search.q}”` : "Nothing matches these filters"}
            actions={
              <Link href="/snippets" className={button({ variant: "ghost" })}>
                Clear filters
              </Link>
            }
          >
            Search looks in titles, tags and code.
          </EmptyState>
        ) : (
          <EmptyState
            title="No snippets yet"
            actions={
              <>
                <Link href="/snippets/new" className={button({ variant: "primary" })}>
                  New snippet
                  <Kbd onAccent>N</Kbd>
                </Link>
                <Link href="/connect" className={button()}>
                  Connect an agent
                </Link>
              </>
            }
          >
            Add one here, or ask a connected agent to save one.
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {snippets.map((s) => (
            <li key={s.slug}>
              <ItemMenu kind="snippets" slug={s.slug} title={s.title} pinned={s.pinned}>
                <Card
                  href={`/snippets/${s.slug}`}
                  kicker={
                    <>
                      <LanguageIcon language={s.language} className="size-3.5" />
                      {languageLabel(s.language)}
                    </>
                  }
                  pinned={s.pinned}
                  title={s.title}
                  body={s.description || <span className="font-mono text-meta text-muted">{s.fileNames.join("  ")}</span>}
                  meta={
                    <Meta>
                      {[
                        <span key="v" className="text-text-2">{`v${s.version}`}</span>,
                        `${s.fileNames.length} file${s.fileNames.length === 1 ? "" : "s"}`,
                        <span key="t" suppressHydrationWarning>
                          {timeAgoShort(s.updatedAt)}
                        </span>,
                        ...s.tags.slice(0, 2).map((t) => `#${t}`),
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
