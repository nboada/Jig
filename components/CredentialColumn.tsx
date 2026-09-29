"use client";

import { searchCredentialSlugs } from "@/app/actions";
import { ListColumn, ListFilters, ListToolbar } from "@/components/SplitList";
import type { CredentialSummary } from "@/lib/credentials";
import { timeAgo } from "@/lib/format";
import type { Sort } from "@/lib/sort";

/** What a credential can be found by in the browser: never its values, secret or not. */
const credentialText = (c: CredentialSummary) => [c.title, c.slug, c.url, c.tags.join(" "), c.labels.join(" ")].join(" ");

export function CredentialFilters({
  credentials,
  sort,
  children,
}: {
  credentials: CredentialSummary[];
  sort: Sort;
  children: React.ReactNode;
}) {
  return (
    <ListFilters
      items={credentials}
      sort={sort}
      section="credentials"
      base="/credentials"
      text={credentialText}
      search={searchCredentialSlugs}
    >
      {children}
    </ListFilters>
  );
}

export function CredentialToolbar() {
  return <ListToolbar placeholder="Search titles, URLs and labels" newLabel="New credential" />;
}

export function CredentialColumn() {
  return (
    <ListColumn<CredentialSummary>
      noun="credential"
      renderRow={(c) => (
        <>
          <span className="block truncate text-sm font-medium group-aria-[current=page]:text-accent">{c.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            {/* Relative times can tick over between the server render and the browser's. */}
            <span className="shrink-0" suppressHydrationWarning>
              {timeAgo(c.updatedAt)}
            </span>
            {c.url && <span className="truncate font-mono text-[11px] text-text/60">{c.url}</span>}
          </span>
        </>
      )}
    />
  );
}
