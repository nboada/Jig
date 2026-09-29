import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { restoreNote } from "@/app/actions";
import { BackLink } from "@/components/BackLink";
import { Markdown } from "@/components/Markdown";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DiffView } from "@/components/DiffView";
import { getDb } from "@/lib/db";
import { compareNotes } from "@/lib/diff";
import { formatDate, formatSource } from "@/lib/format";
import { getNote, getNoteVersionPair, listNoteVersions } from "@/lib/notes";

export const metadata: Metadata = { title: "Note history" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string; to?: string }> };

export default async function NoteHistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const search = await searchParams;
  const db = await getDb();
  const note = await getNote(db, slug);
  if (!note) notFound();

  const versions = await listNoteVersions(db, slug);
  const numbers = new Set(versions.map((v) => v.version));
  const pick = (value: string | undefined, fallback: number) => (numbers.has(Number(value)) ? Number(value) : fallback);
  const to = pick(search.to, note.currentVersion);
  const from = pick(search.from, Math.max(1, to - 1));
  // One version picked (the first, which has nothing before it): show it as it was saved.
  const shown = from === to ? await getNote(db, slug, to) : null;
  const diff = from !== to ? compareNotes(...(await getNoteVersionPair(db, slug, from, to))) : null;

  return (
    <div className="space-y-6">
      <div>
        <BackLink href={`/notes/${slug}`}>{note.title}</BackLink>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">
          {`${versions.length} version${versions.length === 1 ? "" : "s"}. Restoring saves the old content as a new version, so a rollback can be undone too.`}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <ol className="space-y-2 lg:sticky lg:top-22 lg:max-h-[calc(100dvh-7.5rem)] lg:self-start lg:overflow-y-auto">
          {versions.map((v) => {
            const selected = v.version === to;
            const latest = v.version === note.currentVersion;
            return (
              <li
                key={v.version}
                className={`relative rounded-lg border p-3 text-sm transition ${selected ? "border-accent/60 bg-accent/5" : "border-line bg-panel hover:border-muted"}`}
              >
                {/* The whole card shows what changed in this version; the links inside sit above it. */}
                <Link
                  href={`/notes/${slug}/history?from=${Math.max(1, v.version - 1)}&to=${v.version}`}
                  scroll={false}
                  aria-label={`Show version ${v.version}`}
                  className="absolute inset-0 rounded-lg"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium">
                    {`v${v.version}`}
                    {latest && <span className="ml-2 font-sans text-xs font-normal text-accent">latest</span>}
                  </span>
                  <span className="text-xs text-muted">{formatDate(v.createdAt)}</span>
                </div>
                <p className="mt-1">{v.message || <span className="text-muted">No note</span>}</p>
                <p className="mt-0.5 text-xs text-muted">{formatSource(v.source)}</p>
                <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Link href={`/notes/${slug}?v=${v.version}`} className="text-muted hover:text-text">
                    View
                  </Link>
                  {!latest && (
                    <form action={restoreNote}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="version" value={v.version} />
                      <ConfirmButton
                        message={`Restore version ${v.version}? It will be saved as version ${note.currentVersion + 1}.`}
                        className="text-accent hover:underline"
                      >
                        Restore
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="min-w-0 space-y-4">
          <form className="flex flex-wrap items-end gap-3 text-sm">
            {(["from", "to"] as const).map((name) => (
              <label key={name}>
                <span className="mb-1 block capitalize text-muted">{name}</span>
                <select
                  name={name}
                  defaultValue={name === "from" ? from : to}
                  className="rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      {`Version ${v.version}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button className="rounded-md border border-line px-4 py-2 hover:border-muted">Compare</button>
          </form>
          {diff ? (
            <DiffView diff={diff} />
          ) : shown ? (
            <section className="space-y-3">
              <p className="text-sm text-muted">
                {versions.length === 1
                  ? "The only version so far. Edits will show up here as changes."
                  : `Version ${shown.version}, as it was saved.`}
              </p>
              <div className="rounded-lg border border-line bg-panel p-6">
              <Markdown>{shown.body || "This version is empty."}</Markdown>
            </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
