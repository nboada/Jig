import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { GridHead } from "@/components/GridHead";
import { ItemMenu } from "@/components/ItemMenu";
import { Kbd } from "@/components/Kbd";
import { Meta } from "@/components/Meta";
import { PickPane } from "@/components/PickPane";
import { KeyMissing } from "@/components/KeyMissing";
import { listCredentials, listCredentialTags } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { timeAgoShort } from "@/lib/format";
import { getListPrefs } from "@/lib/view";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Credentials" };

type Search = { q?: string; tag?: string; sort?: string };

function href(current: Search, change: Search) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...change })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/credentials?${query}` : "/credentials";
}

export default async function CredentialsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAuth();
  if (!encryptionReady()) return <KeyMissing />;
  const search = await searchParams;
  const { view, sort } = await getListPrefs("credentials", search.sort);
  // In list view the layout shows the credentials in a column; this pane waits for a pick.
  if (view === "list") return <PickPane noun="credential" />;
  const db = await getDb();
  const [credentials, tags] = await Promise.all([
    listCredentials(db, { query: search.q, tag: search.tag, sort }),
    listCredentialTags(db),
  ]);
  const filtered = Boolean(search.q || search.tag);

  return (
    <div className="space-y-6">
      <GridHead
        section="credentials"
        label="Credentials"
        count={credentials.length}
        sort={sort}
        placeholder="Search titles, URLs and labels"
        newLabel="New credential"
        note="Only visible here. Agents connected over MCP can never read these."
        tags={tags}
        activeTag={search.tag}
        tagHref={(tag) => href(search, { tag })}
        hiddenTag={search.tag}
      />

      {credentials.length === 0 ? (
        filtered ? (
          <EmptyState
            title={search.q ? `Nothing matches “${search.q}”` : "Nothing matches this tag"}
            actions={
              <Link href="/credentials" className={button({ variant: "ghost" })}>
                Clear filters
              </Link>
            }
          >
            Search looks in titles, URLs and field labels, never in the values.
          </EmptyState>
        ) : (
          <EmptyState
            title="No credentials yet"
            actions={
              <Link href="/credentials/new" className={button({ variant: "primary" })}>
                New credential
                <Kbd onAccent>N</Kbd>
              </Link>
            }
          >
            Logins and API keys for your own reference. Secret fields are encrypted.
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {credentials.map((c) => (
            <li key={c.slug}>
              <ItemMenu kind="credentials" slug={c.slug} title={c.title} url={c.url}>
                <Card
                  href={`/credentials/${c.slug}`}
                  kicker={c.url ? c.url.replace(/^https?:\/\//, "").split("/")[0] : "Credential"}
                  title={c.title}
                  body={c.labels.length > 0 && <span className="font-mono text-meta text-muted">{c.labels.join(" · ")}</span>}
                  meta={
                    <Meta>
                      {[
                        <span key="t" suppressHydrationWarning>
                          {timeAgoShort(c.updatedAt)}
                        </span>,
                        `${c.labels.length} field${c.labels.length === 1 ? "" : "s"}`,
                        ...c.tags.slice(0, 2).map((t) => `#${t}`),
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
