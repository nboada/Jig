import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeNote, restoreNote } from "@/app/actions";
import { CodeBlock } from "@/components/CodeBlock";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { getDb } from "@/lib/db";
import { formatDate, formatSource } from "@/lib/format";
import { getNote } from "@/lib/notes";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ v?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const note = await getNote(await getDb(), (await params).slug);
  return { title: note?.title ?? "Not found" };
}

export default async function NotePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { v } = await searchParams;
  const version = v ? Number(v) : undefined;
  const note = await getNote(await getDb(), slug, Number.isInteger(version) ? version : undefined);
  if (!note) notFound();

  const isLatest = note.version === note.currentVersion;
  const prompt = `Use my "${note.slug}" note from Snippeta.`;

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-6">
        {!isLatest && (
          <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <p className="flex-1">
              You are viewing version {note.version}. The latest is version {note.currentVersion}.
            </p>
            <div className="flex gap-3">
              <Link href={`/notes/${slug}`} className="rounded-md border border-line px-3 py-1.5 hover:border-muted">
                View latest
              </Link>
              <form action={restoreNote}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="version" value={note.version} />
                <ConfirmButton
                  message={`Restore version ${note.version}? This saves it as a new version, nothing is lost.`}
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
            <span className="rounded bg-raised px-2 py-0.5 font-mono text-muted">v{note.version}</span>
            {note.tags.map((tag) => (
              <Link key={tag} href={`/notes?tag=${encodeURIComponent(tag)}`} className="text-muted hover:text-text">
                #{tag}
              </Link>
            ))}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{note.title}</h1>
        </header>

        {note.body ? (
          <CodeBlock name="note.md" content={note.body} fallback="markdown" />
        ) : (
          <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">This note is empty.</p>
        )}
      </div>

      <aside className="space-y-6 text-sm lg:sticky lg:top-20 lg:self-start">
        {isLatest && (
          <div className="flex gap-2">
            <Link
              href={`/notes/${slug}/edit`}
              className="flex-1 rounded-md bg-accent px-3 py-2 text-center font-medium text-accent-ink hover:brightness-110"
            >
              Edit
            </Link>
            <Link
              href={`/notes/${slug}/history`}
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

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Slug</dt>
          <dd className="truncate font-mono text-xs leading-5">{note.slug}</dd>
          <dt className="text-muted">Saved</dt>
          <dd>{formatDate(note.versionCreatedAt)}</dd>
          <dt className="text-muted">By</dt>
          <dd>{formatSource(note.source)}</dd>
          {note.message && (
            <>
              <dt className="text-muted">Change</dt>
              <dd>{note.message}</dd>
            </>
          )}
          <dt className="text-muted">Created</dt>
          <dd>{formatDate(note.createdAt)}</dd>
        </dl>

        {isLatest && (
          <form action={removeNote} className="border-t border-line pt-4">
            <input type="hidden" name="slug" value={slug} />
            <ConfirmButton
              message={`Delete "${note.title}" and all ${note.currentVersion} version(s)? This cannot be undone.`}
              className="text-danger hover:underline"
            >
              Delete note
            </ConfirmButton>
          </form>
        )}
      </aside>
    </article>
  );
}
