import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeSnippet, restore } from "@/app/actions";
import { BackLink } from "@/components/BackLink";
import { CodeBlock } from "@/components/CodeBlock";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { getDb } from "@/lib/db";
import { formatDate, formatSource } from "@/lib/format";
import { languageLabel } from "@/lib/languages";
import { getSnippet } from "@/lib/snippets";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ v?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const snippet = await getSnippet(await getDb(), (await params).slug);
  return { title: snippet?.title ?? "Not found" };
}

export default async function SnippetPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { v } = await searchParams;
  const version = v ? Number(v) : undefined;
  const snippet = await getSnippet(await getDb(), slug, Number.isInteger(version) ? version : undefined);
  if (!snippet) notFound();

  const isLatest = snippet.version === snippet.currentVersion;
  const prompt = `Add the "${snippet.slug}" snippet from Jig to this project.`;

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-6">
        <BackLink href="/snippets">Snippets</BackLink>
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
              <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`} className="text-muted hover:text-text">
                {`#${tag}`}
              </Link>
            ))}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{snippet.title}</h1>
          {snippet.description && <p className="max-w-2xl text-text/75">{snippet.description}</p>}
        </header>

        {snippet.instructions && (
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-2 text-sm font-medium text-muted">Instructions for agents</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{snippet.instructions}</p>
          </section>
        )}

        <section className="space-y-4">
          {snippet.files.map((file) => (
            <CodeBlock key={file.name} name={file.name} content={file.content} fallback={snippet.language} />
          ))}
        </section>
      </div>

      <aside className="space-y-6 text-sm lg:sticky lg:top-20 lg:self-start">
        {isLatest && (
          <div className="flex gap-2">
            <Link
              href={`/snippets/${slug}/edit`}
              className="flex-1 rounded-md bg-accent px-3 py-2 text-center font-medium text-accent-ink hover:brightness-110"
            >
              Edit
            </Link>
            <Link
              href={`/snippets/${slug}/history`}
              className="flex-1 rounded-md border border-line px-3 py-2 text-center hover:border-muted"
            >
              History
            </Link>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-muted">Ask your agent</h2>
          <div className="flex items-start gap-2 rounded-md border border-line bg-panel p-3">
            <p className="flex-1 font-mono text-xs leading-relaxed">{prompt}</p>
            <CopyButton value={prompt} />
          </div>
        </div>

        {snippet.dependencies.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-muted">Dependencies</h2>
            <ul className="space-y-1 font-mono text-xs">
              {snippet.dependencies.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Slug</dt>
          <dd className="truncate font-mono text-xs leading-5">{snippet.slug}</dd>
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
              className="text-danger hover:underline"
            >
              Delete snippet
            </ConfirmButton>
          </form>
        )}
      </aside>
    </article>
  );
}
