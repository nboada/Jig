"use client";

import { searchCredentialSlugs } from "@/app/actions";
import { ListColumn, ListFilters } from "@/components/SplitList";
import type { CredentialSummary } from "@/lib/credentials";
import { timeAgoShort } from "@/lib/format";
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

export function CredentialColumn() {
  return (
    <ListColumn<CredentialSummary>
      noun="credential"
      label="Credentials"
      placeholder="Search titles, URLs and labels"
      newLabel="New credential"
      renderRow={(c) => (
        <>
          <span className="block truncate text-ui font-medium text-text group-aria-[current=page]:text-accent">{c.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-meta text-muted">
            {/* Relative times can tick over between the server render and the browser's. */}
            <span className="shrink-0" suppressHydrationWarning>
              {timeAgoShort(c.updatedAt)}
            </span>
            {c.url && <span className="truncate text-text-2/80">{c.url.replace(/^https?:\/\//, "")}</span>}
          </span>
        </>
      )}
    />
  );
}
