import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { EnterOnReturn } from "@/components/EnterOnReturn";
import { CopyButton } from "@/components/CopyButton";
import { ActionDivider, DetailRow, EditLink, ItemHeader } from "@/components/ItemHeader";
import { KeyMissing } from "@/components/KeyMissing";
import { Meta } from "@/components/Meta";
import { MoreMenu } from "@/components/MoreMenu";
import { ExternalIcon } from "@/components/NavIcons";
import { SecretValue } from "@/components/SecretValue";
import { ShareButton } from "@/components/ShareButton";
import { getCredential } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { getListPrefs } from "@/lib/view";
import { formatDate, safeHref, timeAgo } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Credential" };

/** "https://acme.myshopify.com/admin" -> "acme.myshopify.com", for the kicker. */
function host(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export default async function CredentialPage({ params }: Props) {
  if (!encryptionReady()) return <KeyMissing />;
  const { slug } = await params;
  const credential = await getCredential(await getDb(), slug);
  if (!credential) notFound();
  const link = safeHref(credential.url);
  const { view } = await getListPrefs("credentials");
  const where = credential.url ? host(link ?? "") : "";

  return (
    <EnterOnReturn className="min-w-0 space-y-6">
      {/* In the split view the list is right there; keep the link for phones and the grid view. */}
      <BackLink href="/credentials" className={`mb-3 ${view === "list" ? "md:hidden" : ""}`}>
        Credentials
      </BackLink>
      <ItemHeader
        kicker={where ? `Credential · ${where}` : "Credential"}
        title={credential.title}
        actions={
          <>
            <ShareButton kind="credentials" slug={slug} title={credential.title} />
            <ActionDivider />
            <EditLink href={`/credentials/${slug}/edit`} />
            <span className="ml-1">
              <MoreMenu
                kind="credentials"
                slug={slug}
                title={credential.title}
                url={credential.url}
                details={
                  <dl className="divide-y divide-line border-t border-line">
                    <DetailRow label="Slug" mono>
                      {credential.slug}
                    </DetailRow>
                    <DetailRow label="Updated">{formatDate(credential.updatedAt)}</DetailRow>
                    <DetailRow label="Created">{formatDate(credential.createdAt)}</DetailRow>
                  </dl>
                }
              />
            </span>
          </>
        }
        meta={
          <Meta>
            {[
              <span key="t" suppressHydrationWarning>{`Updated ${timeAgo(credential.updatedAt)}`}</span>,
              `${credential.fields.length} field${credential.fields.length === 1 ? "" : "s"}`,
              credential.url &&
                (link ? (
                  <a key="url" href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-text-2 transition hover:text-text">
                    {credential.url}
                    <ExternalIcon className="size-3" />
                  </a>
                ) : (
                  <span key="url" className="break-all">
                    {credential.url}
                  </span>
                )),
              credential.tags.length > 0 && (
                <span key="tags" className="flex flex-wrap gap-x-2">
                  {credential.tags.map((tag) => (
                    <Link key={tag} href={`/credentials?tag=${encodeURIComponent(tag)}`} className="text-text-2 transition hover:text-text">
                      {`#${tag}`}
                    </Link>
                  ))}
                </span>
              ),
            ]}
          </Meta>
        }
      />

      <dl className="divide-y divide-line rounded-xl border border-line bg-panel">
        {credential.fields.map((f) => (
          <div key={f.id} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[150px_1fr] sm:items-center sm:gap-4">
            <dt className="engraved">{f.label}</dt>
            <dd className="min-w-0">
              {f.secret ? (
                <SecretValue slug={credential.slug} fieldId={f.id} />
              ) : f.value ? (
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 font-mono text-ui break-all">{f.value}</span>
                  <CopyButton value={f.value} iconOnly />
                </div>
              ) : (
                <span className="text-ui text-faint">Empty</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {credential.note && (
        <section className="space-y-2">
          <h2 className="engraved">Note</h2>
          <p className="max-w-[68ch] text-body whitespace-pre-wrap text-text-2">{credential.note}</p>
        </section>
      )}
    </EnterOnReturn>
  );
}
