import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { restoreNote } from "@/app/actions";
import { BackLink } from "@/components/BackLink";
import { EnterOnReturn } from "@/components/EnterOnReturn";
import { button, iconButton } from "@/components/Button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { ActionDivider, DetailRow, DetailSection, EditLink, ItemHeader, OldVersionBar } from "@/components/ItemHeader";
import { Markdown } from "@/components/Markdown";
import { Meta } from "@/components/Meta";
import { MoreMenu } from "@/components/MoreMenu";
import { ClockIcon } from "@/components/NavIcons";
import { LockButton } from "@/components/LockButton";
import { PinButton } from "@/components/PinButton";
import { Tip } from "@/components/Tooltip";
import { ShareButton } from "@/components/ShareButton";
import { getDb } from "@/lib/db";
import { agentPrompt } from "@/lib/prompts";
import { formatDate, formatSource, timeAgo } from "@/lib/format";
import { unlockedCodec } from "@/lib/locked-notes";
import { getNote } from "@/lib/notes";
import { hasPasskeys } from "@/lib/passkeys";
import { UnlockPanel } from "@/components/Passkeys";
import { LockIcon } from "@/components/NavIcons";
import { getListPrefs } from "@/lib/view";
import { requireAuth } from "@/lib/auth";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ v?: string }> };

const toVersion = (v?: string) => (v && Number.isInteger(Number(v)) ? Number(v) : undefined);

const loadNote = cache(async (slug: string, version: number | undefined) =>
  getNote(await getDb(), slug, version, await unlockedCodec()),
);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  await requireAuth();
  const note = await loadNote((await params).slug, toVersion((await searchParams).v));
  return { title: note?.title ?? "Not found" };
}

export default async function NotePage({ params, searchParams }: Props) {
  await requireAuth();
  const { slug } = await params;
  const { v } = await searchParams;
  const note = await loadNote(slug, toVersion(v));
  if (!note) notFound();

  const isLatest = note.version === note.currentVersion;
  const { view } = await getListPrefs("notes");
  const prompt = agentPrompt("notes", note.slug);
  const readable = !note.unreadable;
  const passkey = note.unreadable ? await hasPasskeys(await getDb()) : false;

  return (
    <EnterOnReturn className="min-w-0 space-y-7">
      {note.locked && <meta name="jig-offline" content="skip" />}
      <BackLink href="/notes" className={`mb-3 ${view === "list" ? "md:hidden" : ""}`}>
        Notes
      </BackLink>
      {!isLatest && (
        <OldVersionBar
          version={note.version}
          latest={note.currentVersion}
          latestHref={`/notes/${slug}`}
          restore={
            <form action={restoreNote}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="version" value={note.version} />
              <ConfirmButton
                message={`Restore version ${note.version}? This saves it as a new version, nothing is lost.`}
                className={button({ size: "sm" })}
              >
                Restore this version
              </ConfirmButton>
            </form>
          }
        />
      )}

      <ItemHeader
        kicker={
          note.locked && (
            <>
              <LockIcon className="size-3.5" />
              {readable ? "Unlocked" : "Locked"}
            </>
          )
        }
        title={note.title}
        actions={
          <>
            {isLatest && (
              <>
                <PinButton kind="notes" slug={slug} pinned={note.pinned} />
                <LockButton slug={slug} locked={note.locked} readable={readable} />
                {readable && note.body && <CopyButton value={note.body} label="Copy markdown" iconOnly />}
                {readable && (
                  <Tip label="History">
                    <Link href={`/notes/${slug}/history`} aria-label="History" className={iconButton()}>
                      <ClockIcon className="size-4" />
                    </Link>
                  </Tip>
                )}
                {!note.locked && <ShareButton kind="notes" slug={slug} title={note.title} />}
              </>
            )}
            {isLatest && readable && <ActionDivider />}
            <span>
              <MoreMenu
                kind="notes"
                slug={slug}
                title={note.title}
                pinned={note.pinned}
                locked={note.locked}
                latest={isLatest}
                versions={note.currentVersion}
                details={
                  <div className="space-y-6">
                    <DetailSection label="Ask your agent">
                      <div className="flex items-start gap-2 rounded-lg border border-line bg-well p-3">
                        <p className="flex-1 font-mono text-meta leading-relaxed text-text-2">{prompt}</p>
                        <CopyButton value={prompt} iconOnly />
                      </div>
                    </DetailSection>
                    <dl className="divide-y divide-line border-t border-line">
                      <DetailRow label="Slug" mono>
                        {note.slug}
                      </DetailRow>
                      <DetailRow label="Saved">{formatDate(note.versionCreatedAt)}</DetailRow>
                      <DetailRow label="By">{formatSource(note.source)}</DetailRow>
                      {note.message && <DetailRow label="Change">{note.message}</DetailRow>}
                      <DetailRow label="Created">{formatDate(note.createdAt)}</DetailRow>
                    </dl>
                  </div>
                }
              />
            </span>
            {isLatest && readable && <EditLink href={`/notes/${slug}/edit`} />}
          </>
        }
        meta={
          <Meta>
            {[
              note.source !== "web" && formatSource(note.source),
              <span key="t" suppressHydrationWarning>
                {timeAgo(note.versionCreatedAt)}
              </span>,
              note.tags.length > 0 && (
                <span key="tags" className="flex flex-wrap gap-x-2">
                  {note.tags.map((tag) => (
                    <Link key={tag} href={`/notes?tag=${encodeURIComponent(tag)}`} className="text-text-2 transition hover:text-text">
                      {`#${tag}`}
                    </Link>
                  ))}
                </span>
              ),
            ]}
          </Meta>
        }
      />

      {!readable ? (
        <UnlockPanel hasPasskey={passkey} />
      ) : note.body ? (
        <div className="rounded-xl border border-line bg-well px-5 py-4 sm:px-7 sm:py-6">
          <Markdown size="read">{note.body}</Markdown>
        </div>
      ) : (
        <p className="text-body text-muted">This note is empty.</p>
      )}
    </EnterOnReturn>
  );
}
