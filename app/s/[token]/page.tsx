import type { Metadata } from "next";
import { cookies } from "next/headers";
import { openShare } from "@/app/share-actions";
import { button } from "@/components/Button";
import { CodeFiles } from "@/components/CodeBlock";
import { CopyButton } from "@/components/CopyButton";
import { ItemHeader } from "@/components/ItemHeader";
import { LanguageIcon } from "@/components/LanguageIcon";
import { Credit } from "@/components/Credit";
import { Logo } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { Meta } from "@/components/Meta";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { languageLabel } from "@/lib/languages";
import { passAdmits, passCookieName } from "@/lib/share-pass";
import { findShare, loadSharedItem, recordView, shareStatus, type Share, type SharedItem } from "@/lib/shares";
import { PasscodeForm } from "./PasscodeForm";
import { SharedSecret } from "./SharedSecret";

// The token is the secret: never send it on to sites linked from a shared note, never index it.
export const metadata: Metadata = { title: "Shared with you", referrer: "no-referrer", robots: { index: false, follow: false } };

const NOUNS = { snippets: "snippet", notes: "note", credentials: "credential" } as const;

// The engraved state and the heading for a link that can no longer be opened.
const CLOSED: Record<string, [string, string]> = {
  expired: ["Link expired", "This link has expired"],
  revoked: ["Link turned off", "This link has been turned off"],
  used: ["Link used", "This link has already been used"],
  locked: ["Link locked", "This link is locked after too many wrong passcodes"],
};

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const share = await findShare(db, token);
  if (!share) return <Gate state="Link not found" title="This link doesn't exist" />;
  if (share.kind === "credentials" && !encryptionReady()) return <Gate state="Unavailable" title="This link can't be opened right now" />;

  const pass = (await cookies()).get(passCookieName(share.id))?.value;
  const noun = NOUNS[share.kind];

  // Seen a moment ago in this browser: show it again without using another view.
  if (await passAdmits(db, share, pass)) return <Shared share={share} item={await loadSharedItem(db, share)} />;

  const status = shareStatus(share);
  if (status !== "open") return <Gate state={CLOSED[status][0]} title={CLOSED[status][1]} />;

  if (share.protected) {
    return (
      <Gate state="Passcode required" title={`A ${noun} was shared with you`} line="Enter the passcode you were sent separately.">
        <PasscodeForm token={token} />
      </Gate>
    );
  }

  // Limited links wait for a click, so link previews (Slack, iMessage…) don't use up views.
  if (share.maxViews != null) {
    const left = share.maxViews - share.views;
    return (
      <Gate
        state={`${left} view${left === 1 ? "" : "s"} left`}
        title={`A ${noun} was shared with you`}
        line={`This link can be opened ${left} more ${left === 1 ? "time" : "times"}.`}
      >
        <form action={openShare}>
          <input type="hidden" name="token" value={token} />
          <button className={button({ variant: "primary", size: "lg", className: "w-full" })}>{`View ${noun}`}</button>
        </form>
      </Gate>
    );
  }

  await recordView(db, share);
  return <Shared share={share} item={await loadSharedItem(db, share)} />;
}

/** A link that asks for something first, or can't be opened: a small card on the workbench. */
function Gate({ state, title, line, children }: { state: string; title: string; line?: string; children?: React.ReactNode }) {
  return (
    <main className="bench relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="relative w-full max-w-sm">
        <Logo className="mb-8" />
        <p className="engraved">{state}</p>
        <h1 className="mt-2 text-title font-semibold">{title}</h1>
        {line && <p className="mt-2 text-body text-text-2">{line}</p>}
        {children && <div className="mt-6">{children}</div>}
        <Credit className="mt-10" />
      </div>
    </main>
  );
}

/**
 * The shared item itself, on the same centred workbench as the passcode screen: the logo, the item
 * as the dashboard shows it, then when the link expires. Each kind gets a width that suits it.
 */
function Shared({ share, item }: { share: Share; item: SharedItem | null }) {
  if (!item) return <Gate state="Deleted" title="What was shared here has since been deleted" />;
  const width = item.kind === "credentials" ? "max-w-xl" : item.kind === "notes" ? "max-w-3xl" : "max-w-4xl";
  return (
    <main className="bench relative grid min-h-dvh place-items-center px-4 py-10">
      <div className={`relative w-full ${width}`}>
        <Logo className="mb-8" />
        {item.kind === "snippets" && (
          <article className="space-y-6">
            <ItemHeader
              kicker={
                <>
                  <LanguageIcon language={item.snippet.language} className="size-3.5" />
                  {`Snippet · ${languageLabel(item.snippet.language)} · Read-only`}
                </>
              }
              title={item.snippet.title}
              meta={
                <Meta>
                  {[
                    `${item.snippet.files.length} file${item.snippet.files.length === 1 ? "" : "s"}`,
                    item.snippet.dependencies.length > 0 && `needs ${item.snippet.dependencies.join(", ")}`,
                  ]}
                </Meta>
              }
              description={item.snippet.description}
            />
            {item.snippet.instructions && (
              <section className="space-y-2 border-t border-line pt-4">
                <h2 className="engraved">Instructions</h2>
                <div className="max-w-[72ch]">
                  <Markdown>{item.snippet.instructions}</Markdown>
                </div>
              </section>
            )}
            <CodeFiles files={item.snippet.files} fallback={item.snippet.language} />
          </article>
        )}
        {item.kind === "notes" && (
          <article className="space-y-7">
            <ItemHeader kicker="Note · Read-only" title={item.note.title} />
            <div className="rounded-xl border border-line bg-well px-5 py-4 sm:px-7 sm:py-6">
              <Markdown size="read">{item.note.body || "This note is empty."}</Markdown>
            </div>
          </article>
        )}
        {item.kind === "credentials" && (
          <article className="space-y-6">
            <ItemHeader
              kicker="Credential · Read-only"
              title={item.credential.title}
              meta={item.credential.url ? <Meta>{[<span key="u" className="break-all">{item.credential.url}</span>]}</Meta> : undefined}
            />
            <dl className="divide-y divide-line rounded-xl border border-line bg-panel">
              {item.credential.fields.map((f) => (
                <div key={f.id} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[120px_1fr] sm:items-center sm:gap-4">
                  <dt className="engraved">{f.label}</dt>
                  <dd className="min-w-0">
                    {f.secret ? (
                      <SharedSecret value={item.secrets[f.id] ?? ""} />
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
            {item.credential.note && (
              <section className="space-y-2">
                <h2 className="engraved">Note</h2>
                <p className="max-w-[68ch] text-body whitespace-pre-wrap text-text-2">{item.credential.note}</p>
              </section>
            )}
          </article>
        )}
        <p className="engraved mt-10" suppressHydrationWarning>
          {share.expiresAt ? `This link expires ${formatDate(share.expiresAt)}` : "Shared from Jig"}
        </p>
        <Credit className="mt-2" />
      </div>
    </main>
  );
}
