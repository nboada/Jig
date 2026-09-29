import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { restore } from "@/app/actions";
import { BackLink } from "@/components/BackLink";
import { button, iconButton } from "@/components/Button";
import { CodeFiles } from "@/components/CodeBlock";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { ActionDivider, DetailRow, DetailSection, EditLink, ItemHeader, OldVersionBar } from "@/components/ItemHeader";
import { LanguageIcon } from "@/components/LanguageIcon";
import { Markdown } from "@/components/Markdown";
import { Meta } from "@/components/Meta";
import { MoreMenu } from "@/components/MoreMenu";
import { ClockIcon } from "@/components/NavIcons";
import { PinButton } from "@/components/PinButton";
import { ShareButton } from "@/components/ShareButton";
import { getDb } from "@/lib/db";
import { agentPrompt } from "@/lib/prompts";
import { formatDate, formatSource, timeAgo } from "@/lib/format";
import { languageLabel } from "@/lib/languages";
import { getSnippet } from "@/lib/snippets";
import { getListPrefs } from "@/lib/view";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ v?: string }> };

/** A `?v=` version number, or undefined for the latest. */
const toVersion = (v?: string) => (v && Number.isInteger(Number(v)) ? Number(v) : undefined);

// The page title and the page both need the snippet; cache() makes that one query per request.
// Both pass the same arguments, version included, so they share the cached result.
const loadSnippet = cache(async (slug: string, version: number | undefined) => getSnippet(await getDb(), slug, version));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const snippet = await loadSnippet((await params).slug, toVersion((await searchParams).v));
  return { title: snippet?.title ?? "Not found" };
}

export default async function SnippetPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { v } = await searchParams;
  const snippet = await loadSnippet(slug, toVersion(v));
  if (!snippet) notFound();

  const isLatest = snippet.version === snippet.currentVersion;
  const { view } = await getListPrefs("snippets");
  const prompt = agentPrompt("snippets", snippet.slug);
  const files = snippet.files.length;

  return (
    <article className="min-w-0 space-y-6">
      {/* In the split view the list is right there; keep the link for phones and the grid view. */}
      <BackLink href="/snippets" className={`mb-3 ${view === "list" ? "md:hidden" : ""}`}>
        Snippets
      </BackLink>
      {!isLatest && (
        <OldVersionBar
          version={snippet.version}
          latest={snippet.currentVersion}
          latestHref={`/snippets/${slug}`}
          restore={
            <form action={restore}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="version" value={snippet.version} />
              <ConfirmButton
                message={`Restore version ${snippet.version}? This saves it as a new version, nothing is lost.`}
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
          <>
            <LanguageIcon language={snippet.language} className="size-3.5" />
            {`Snippet · ${languageLabel(snippet.language)}`}
          </>
        }
        title={snippet.title}
        actions={
          <>
            {isLatest && (
              <>
                <PinButton kind="snippets" slug={slug} pinned={snippet.pinned} />
                <Link href={`/snippets/${slug}/history`} aria-label="History" title="History" className={iconButton()}>
                  <ClockIcon className="size-4" />
                </Link>
                <ShareButton kind="snippets" slug={slug} title={snippet.title} />
                <ActionDivider />
                <EditLink href={`/snippets/${slug}/edit`} />
              </>
            )}
            <span className="ml-1">
              <MoreMenu
                kind="snippets"
                slug={slug}
                title={snippet.title}
                pinned={snippet.pinned}
                latest={isLatest}
                versions={snippet.currentVersion}
                details={
                  <div className="space-y-6">
                    <DetailSection label="Ask your agent">
                      <div className="flex items-start gap-2 rounded-lg border border-line bg-well p-3">
                        <p className="flex-1 font-mono text-meta leading-relaxed text-text-2">{prompt}</p>
                        <CopyButton value={prompt} iconOnly />
                      </div>
                    </DetailSection>
                    {snippet.instructions && (
                      <DetailSection label="Instructions for agents">
                        <div className="max-h-60 overflow-y-auto rounded-lg border border-line bg-well p-3">
                          <Markdown>{snippet.instructions}</Markdown>
                        </div>
                      </DetailSection>
                    )}
                    {snippet.dependencies.length > 0 && (
                      <DetailSection label="Dependencies">
                        <ul className="space-y-1 font-mono text-meta text-text-2">
                          {snippet.dependencies.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </DetailSection>
                    )}
                    <dl className="divide-y divide-line border-t border-line">
                      <DetailRow label="Slug" mono>
                        {snippet.slug}
                      </DetailRow>
                      <DetailRow label="Saved">{formatDate(snippet.versionCreatedAt)}</DetailRow>
                      <DetailRow label="By">{formatSource(snippet.source)}</DetailRow>
                      {snippet.message && <DetailRow label="Change">{snippet.message}</DetailRow>}
                      <DetailRow label="Created">{formatDate(snippet.createdAt)}</DetailRow>
                    </dl>
                  </div>
                }
              />
            </span>
          </>
        }
        meta={
          <Meta>
            {[
              <span key="v" className="text-text-2">{`v${snippet.version}`}</span>,
              formatSource(snippet.source),
              <span key="t" suppressHydrationWarning>
                {timeAgo(snippet.versionCreatedAt)}
              </span>,
              `${files} file${files === 1 ? "" : "s"}`,
              snippet.tags.length > 0 && (
                <span key="tags" className="flex flex-wrap gap-x-2">
                  {snippet.tags.map((tag) => (
                    <Link key={tag} href={`/snippets?tag=${encodeURIComponent(tag)}`} className="text-text-2 transition hover:text-text">
                      {`#${tag}`}
                    </Link>
                  ))}
                </span>
              ),
            ]}
          </Meta>
        }
        description={snippet.description}
      />

      <CodeFiles files={snippet.files} fallback={snippet.language} />
    </article>
  );
}
