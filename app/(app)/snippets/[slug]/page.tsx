import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeSnippet, restore } from "@/app/actions";
import { BackLink } from "@/components/BackLink";
import { CodeBlock } from "@/components/CodeBlock";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Markdown } from "@/components/Markdown";
import { CopyButton } from "@/components/CopyButton";
import { getDb } from "@/lib/db";
import { formatDate, formatSource } from "@/lib/format";
import { languageLabel } from "@/lib/languages";
import { getSnippet } from "@/lib/snippets";
import { getListPrefs } from "@/lib/view";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ v?: string }> };

/** A `?v=` version number, or undefined for the latest. */
const toVersion = (v?: string) => (v && Number.isInteger(Number(v)) ? Number(v) : undefined);

// The page title and the page both need the snippet; cache() makes that one query per request.
// Both pass the same arguments, version included, so they share the cached result.
const loadSnippet = cache(async (slug: string, version: number | undefined) => getSnippet(await getDb(), slug, version));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const snippet = await loadSnippet((await params).slug, toVersion((await searchParams).v));
  return { title: snippet?.title ?? "Not found" };
}

export default async function SnippetPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { v } = await searchParams;
  const snippet = await loadSnippet(slug, toVersion(v));
  if (!snippet) notFound();

  const isLatest = snippet.version === snippet.currentVersion;
  const { view } = await getListPrefs("snippets");
  const prompt = `Add the "${snippet.slug}" snippet from Jig to this project.`;

  return (
    <article className="grid gap-8 @5xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0 space-y-6">
        {/* In the split view the list is right there; keep the link for phones and the grid view. */}
        <BackLink href="/snippets" className={view === "list" ? "md:hidden" : ""}>
          Snippets
        </BackLink>
        {!isLatest && (
          <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <p className="flex-1">
              {`You are viewing version ${snippet.version}. The latest is version ${snippet.currentVersion}.`}
            </p>
            <div className="flex gap-3">
              <Link href={`/snippets/${slug}`} className="rounded-md border border-line px-3 py-1.5 hover:border-muted">
                View latest
              </Link>
              <form action={restore}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="version" value={snippet.version} />
                <ConfirmButton
                  message={`Restore version ${snippet.version}? This saves it as a new version, nothing is lost.`}
                  className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-ink"
                >
                  Restore this version
                </ConfirmButton>
              </form>
            </div>
          </div>
        )}

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-accent/15 px-2 py-0.5 font-medium text-accent">
              {languageLabel(snippet.language)}
            </span>
            <span className="rounded bg-raised px-2 py-0.5 font-mono text-muted">{`v${snippet.version}`}</span>
            {snippet.tags.map((tag) => (
              <Link key={tag} href={`/snippets?tag=${encodeURIComponent(tag)}`} className="text-muted hover:text-text">
                {`#${tag}`}
              </Link>
            ))}
          </div>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{snippet.title}</h1>
            {isLatest && (
              <div className="flex shrink-0 gap-2 text-sm">
                <Link
                  href={`/snippets/${slug}/history`}
                  className="rounded-md border border-line px-3 py-1.5 hover:border-muted"
                >
                  History
                </Link>
                <Link
                  href={`/snippets/${slug}/edit`}
                  className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-ink hover:brightness-110"
                >
                  Edit
                </Link>
              </div>
            )}
          </div>
          {snippet.description && <p className="max-w-2xl text-sm leading-6 text-text/75">{snippet.description}</p>}
        </header>

        {snippet.instructions && (
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-2 text-sm font-medium text-muted">Instructions for agents</h2>
            <Markdown>{snippet.instructions}</Markdown>
          </section>
        )}

        <section className="space-y-4">
          {snippet.files.map((file) => (
            <CodeBlock key={file.name} name={file.name} content={file.content} fallback={snippet.language} />
          ))}
        </section>
      </div>

      <aside className="space-y-5 text-xs @5xl:sticky @5xl:top-22 @5xl:self-start">
        <div className="space-y-2">
          <h2 className="text-muted">Ask your agent</h2>
          <div className="flex items-start gap-2 rounded-md border border-line bg-panel p-2.5">
            <p className="flex-1 font-mono text-[11px] leading-relaxed">{prompt}</p>
            <CopyButton value={prompt} />
          </div>
        </div>

        {snippet.dependencies.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-muted">Dependencies</h2>
            <ul className="space-y-1 font-mono text-[11px]">
              {snippet.dependencies.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-muted">Slug</dt>
          <dd className="truncate font-mono text-[11px] leading-4">{snippet.slug}</dd>
          <dt className="text-muted">Saved</dt>
          <dd>{formatDate(snippet.versionCreatedAt)}</dd>
          <dt className="text-muted">By</dt>
          <dd>{formatSource(snippet.source)}</dd>
          {snippet.message && (
            <>
              <dt className="text-muted">Note</dt>
              <dd>{snippet.message}</dd>
            </>
          )}
          <dt className="text-muted">Created</dt>
          <dd>{formatDate(snippet.createdAt)}</dd>
        </dl>

        {isLatest && (
          <form action={removeSnippet} className="border-t border-line pt-4">
            <input type="hidden" name="slug" value={slug} />
            <ConfirmButton
              message={`Delete "${snippet.title}" and all ${snippet.currentVersion} version(s)? This cannot be undone.`}
              tone="danger"
              hides={slug}
              className="w-full rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10"
            >
              Delete snippet
            </ConfirmButton>
          </form>
        )}
      </aside>
    </article>
  );
}
