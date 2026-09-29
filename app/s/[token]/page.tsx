import type { Metadata } from "next";
import { cookies } from "next/headers";
import { openShare } from "@/app/share-actions";
import { CodeBlock } from "@/components/CodeBlock";
import { Logo } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
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

const CLOSED: Record<string, string> = {
  expired: "This link has expired.",
  revoked: "This link has been turned off.",
  used: "This link has already been used.",
  locked: "This link is locked after too many wrong passcodes.",
};

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const share = await findShare(db, token);
  if (!share) return <Frame>{<Message>This link doesn't exist.</Message>}</Frame>;
  if (share.kind === "credentials" && !encryptionReady()) return <Frame>{<Message>This link can't be opened right now.</Message>}</Frame>;

  const pass = (await cookies()).get(passCookieName(share.id))?.value;
  const noun = NOUNS[share.kind];

  // Seen a moment ago in this browser: show it again without using another view.
  if (await passAdmits(share, pass)) return <Shared share={share} item={await loadSharedItem(db, share)} />;

  const status = shareStatus(share);
  if (status !== "open") return <Frame>{<Message>{CLOSED[status]}</Message>}</Frame>;

  if (share.protected) {
    return (
      <Frame>
        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold">{`A ${noun} was shared with you`}</h1>
            <p className="mt-1 text-sm text-muted">Enter the passcode you were sent separately.</p>
          </div>
          <PasscodeForm token={token} />
        </div>
      </Frame>
    );
  }

  // Limited links wait for a click, so link previews (Slack, iMessage…) don't use up views.
  if (share.maxViews != null) {
    const left = share.maxViews - share.views;
    return (
      <Frame>
        <form action={openShare} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <h1 className="text-lg font-semibold">{`A ${noun} was shared with you`}</h1>
            <p className="mt-1 text-sm text-muted">{`This link can be opened ${left} more ${left === 1 ? "time" : "times"}.`}</p>
          </div>
          <button className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:brightness-110">
            {`View ${noun}`}
          </button>
        </form>
      </Frame>
    );
  }

  await recordView(db, share);
  return <Shared share={share} item={await loadSharedItem(db, share)} />;
}

function Frame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto min-h-dvh w-full px-4 py-10 ${wide ? "max-w-4xl" : "grid max-w-sm place-items-center"}`}>
      <div className="w-full">
        <Logo className="mb-8" />
        {children}
      </div>
    </main>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-line bg-panel p-5 text-sm text-text/85">{children}</p>;
}

function Shared({ share, item }: { share: Share; item: SharedItem | null }) {
  if (!item) return <Frame>{<Message>What was shared here has since been deleted.</Message>}</Frame>;
  const expiry = share.expiresAt ? `Link expires ${formatDate(share.expiresAt)}` : "Shared from Jig";
  return (
    <Frame wide>
      <p className="mb-2 text-xs text-muted">{expiry}</p>
      {item.kind === "snippets" && (
        <article className="space-y-6">
          <header className="space-y-2">
            <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
              {languageLabel(item.snippet.language)}
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">{item.snippet.title}</h1>
            {item.snippet.description && <p className="text-sm leading-6 text-text/75">{item.snippet.description}</p>}
          </header>
          {item.snippet.instructions && (
            <section className="rounded-lg border border-line bg-panel p-4">
              <h2 className="mb-2 text-sm font-medium text-muted">Instructions</h2>
              <Markdown>{item.snippet.instructions}</Markdown>
            </section>
          )}
          <section className="space-y-4">
            {item.snippet.files.map((file) => (
              <CodeBlock key={file.name} name={file.name} content={file.content} fallback={item.snippet.language} />
            ))}
          </section>
        </article>
      )}
      {item.kind === "notes" && (
        <article className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight">{item.note.title}</h1>
          <div className="rounded-lg border border-line bg-panel p-6">
            <Markdown>{item.note.body || "This note is empty."}</Markdown>
          </div>
        </article>
      )}
      {item.kind === "credentials" && (
        <article className="space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{item.credential.title}</h1>
            {item.credential.url && <p className="break-all font-mono text-sm text-muted">{item.credential.url}</p>}
          </header>
          <dl className="divide-y divide-line rounded-lg border border-line bg-panel">
            {item.credential.fields.map((f) => (
              <div key={f.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:items-center sm:gap-4">
                <dt className="text-sm text-muted">{f.label}</dt>
                <dd className="min-w-0">
                  {f.secret ? (
                    <SharedSecret value={item.secrets[f.id] ?? ""} />
                  ) : (
                    <span className="break-all font-mono text-sm">{f.value || "(empty)"}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {item.credential.note && (
            <section className="rounded-lg border border-line bg-panel p-4">
              <h2 className="mb-2 text-sm font-medium text-muted">Note</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.credential.note}</p>
            </section>
          )}
        </article>
      )}
    </Frame>
  );
}
