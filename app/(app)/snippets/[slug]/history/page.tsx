import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { restore } from "@/app/actions";
import { BackLink } from "@/components/BackLink";
import { CodeFiles } from "@/components/CodeBlock";
import { button } from "@/components/Button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DiffView } from "@/components/DiffView";
import { getDb } from "@/lib/db";
import { compareVersions } from "@/lib/diff";
import { formatDate, formatSource } from "@/lib/format";
import { getSnippet, getVersionPair, listVersions } from "@/lib/snippets";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "History" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string; to?: string }> };

export default async function HistoryPage({ params, searchParams }: Props) {
  await requireAuth();
  const { slug } = await params;
  const search = await searchParams;
  const db = await getDb();
  const snippet = await getSnippet(db, slug);
  if (!snippet) notFound();

  const versions = await listVersions(db, slug);
  const numbers = new Set(versions.map((v) => v.version));
  const pick = (value: string | undefined, fallback: number) =>
    numbers.has(Number(value)) ? Number(value) : fallback;
  const to = pick(search.to, snippet.currentVersion);
  const from = pick(search.from, Math.max(1, to - 1));
  // One version picked (the first, which has nothing before it): show it as it was saved.
  const shown = from === to ? await getSnippet(db, slug, to) : null;
  const diff = from !== to ? compareVersions(...(await getVersionPair(db, slug, from, to))) : null;

  return (
    <div className="space-y-6">
      <div>
        <BackLink href={`/snippets/${slug}`}>{snippet.title}</BackLink>
        <h1 className="mt-2 text-title font-semibold">History</h1>
        <p className="mt-1 text-body text-muted">
          {`${versions.length} version${versions.length === 1 ? "" : "s"}. Restoring saves the old content as a new version, so a rollback can be undone too.`}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <ol className="space-y-2 lg:sticky lg:top-(--pane-top) lg:max-h-[calc(100dvh-var(--pane-top)-1.5rem)] lg:self-start lg:overflow-y-auto">
          {versions.map((v) => {
            const selected = v.version === to;
            const latest = v.version === snippet.currentVersion;
            return (
              <li
                key={v.version}
                className={`relative rounded-xl border p-3 text-ui transition ${selected ? "border-accent-line bg-accent-soft" : "border-line bg-panel hover:border-line-strong"}`}
              >
                {/* The whole card shows what changed in this version; the links inside sit above it. */}
                <Link
                  href={`/snippets/${slug}/history?from=${Math.max(1, v.version - 1)}&to=${v.version}`}
                  scroll={false}
                  aria-label={`Show version ${v.version}`}
                  className="absolute inset-0 rounded-xl"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium">
                    {`v${v.version}`}
                    {latest && <span className="engraved ml-2 text-accent">latest</span>}
                  </span>
                  <span className="font-mono text-meta text-muted">{formatDate(v.createdAt)}</span>
                </div>
                <p className="mt-1">{v.message || <span className="text-muted">No note</span>}</p>
                <p className="mt-0.5 font-mono text-meta text-muted">{formatSource(v.source)}</p>
                <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
                  <Link href={`/snippets/${slug}?v=${v.version}`} className="text-muted hover:text-text">
                    View
                  </Link>
                  {!latest && (
                    <form action={restore}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="version" value={v.version} />
                      <ConfirmButton
                        message={`Restore version ${v.version}? It will be saved as version ${snippet.currentVersion + 1}.`}
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
          <form className="flex flex-wrap items-end gap-3 text-ui">
            {(["from", "to"] as const).map((name) => (
              <label key={name}>
                <span className="engraved mb-1.5 block">{name}</span>
                <select
                  name={name}
                  defaultValue={name === "from" ? from : to}
                  className="h-8 rounded-lg border border-line bg-well px-2.5 text-ui outline-none focus:border-accent"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      {`Version ${v.version}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button className={button()}>Compare</button>
          </form>
          {diff ? (
            <DiffView diff={diff} />
          ) : shown ? (
            <section className="space-y-3">
              <p className="text-ui text-muted">
                {versions.length === 1
                  ? "The only version so far. Edits will show up here as changes."
                  : `Version ${shown.version}, as it was saved.`}
              </p>
              <CodeFiles files={shown.files} fallback={shown.language} />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
