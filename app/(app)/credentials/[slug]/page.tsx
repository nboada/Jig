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
import { formatDate, safeHref } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Credential" };

export default async function CredentialPage({ params }: Props) {
  if (!encryptionReady()) return <KeyMissing />;
  const { slug } = await params;
  const credential = await getCredential(await getDb(), slug);
  if (!credential) notFound();
  const link = safeHref(credential.url);

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-6">
        <BackLink href="/credentials">Credentials</BackLink>
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
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{credential.title}</h1>
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

      <aside className="space-y-6 text-sm lg:sticky lg:top-20 lg:self-start">
        <Link
          href={`/credentials/${slug}/edit`}
          className="block rounded-md bg-accent px-3 py-2 text-center font-medium text-accent-ink hover:brightness-110"
        >
          Edit
        </Link>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Updated</dt>
          <dd>{formatDate(credential.updatedAt)}</dd>
          <dt className="text-muted">Created</dt>
          <dd>{formatDate(credential.createdAt)}</dd>
        </dl>
        <form action={removeCredential} className="border-t border-line pt-4">
          <input type="hidden" name="slug" value={slug} />
          <ConfirmButton message={`Delete "${credential.title}"? This cannot be undone.`} className="text-danger hover:underline">
            Delete credential
          </ConfirmButton>
        </form>
      </aside>
    </article>
  );
}
