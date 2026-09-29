import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeCredential } from "@/app/actions";
import { BackLink } from "@/components/BackLink";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { KeyMissing } from "@/components/KeyMissing";
import { SecretValue } from "@/components/SecretValue";
import { getCredential } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { getListPrefs } from "@/lib/view";
import { formatDate, safeHref } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Credential" };

export default async function CredentialPage({ params }: Props) {
  if (!encryptionReady()) return <KeyMissing />;
  const { slug } = await params;
  const credential = await getCredential(await getDb(), slug);
  if (!credential) notFound();
  const link = safeHref(credential.url);
  const { view } = await getListPrefs("credentials");

  return (
    <article className="grid gap-8 @5xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0 space-y-6">
        {/* In the split view the list is right there; keep the link for phones and the grid view. */}
        <BackLink href="/credentials" className={view === "list" ? "md:hidden" : ""}>
          Credentials
        </BackLink>
        <header className="space-y-3">
          {credential.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {credential.tags.map((tag) => (
                <Link key={tag} href={`/credentials?tag=${encodeURIComponent(tag)}`} className="text-muted hover:text-text">
                  {`#${tag}`}
                </Link>
              ))}
            </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{credential.title}</h1>
            <Link
              href={`/credentials/${slug}/edit`}
              className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:brightness-110"
            >
              Edit
            </Link>
          </div>
          {credential.url &&
            (link ? (
              <a href={link} target="_blank" rel="noreferrer" className="block break-all font-mono text-sm text-accent hover:underline">
                {credential.url}
              </a>
            ) : (
              <p className="break-all font-mono text-sm text-muted">{credential.url}</p>
            ))}
        </header>

        <dl className="divide-y divide-line rounded-lg border border-line bg-panel">
          {credential.fields.map((f) => (
            <div key={f.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:items-center sm:gap-4">
              <dt className="text-sm text-muted">{f.label}</dt>
              <dd className="min-w-0">
                {f.secret ? (
                  <SecretValue slug={credential.slug} fieldId={f.id} />
                ) : f.value ? (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 break-all font-mono text-sm">{f.value}</span>
                    <CopyButton value={f.value} />
                  </div>
                ) : (
                  <span className="text-sm text-muted">(empty)</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {credential.note && (
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-2 text-sm font-medium text-muted">Note</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{credential.note}</p>
          </section>
        )}
      </div>

      <aside className="space-y-5 text-xs @5xl:sticky @5xl:top-22 @5xl:self-start">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-muted">Updated</dt>
          <dd>{formatDate(credential.updatedAt)}</dd>
          <dt className="text-muted">Created</dt>
          <dd>{formatDate(credential.createdAt)}</dd>
        </dl>
        <form action={removeCredential} className="border-t border-line pt-4">
          <input type="hidden" name="slug" value={slug} />
          <ConfirmButton message={`Delete "${credential.title}"? This cannot be undone.`} tone="danger"
              hides={slug}
              className="w-full rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10">
            Delete credential
          </ConfirmButton>
        </form>
      </aside>
    </article>
  );
}
