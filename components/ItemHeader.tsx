import Link from "next/link";
import { button } from "@/components/Button";

/**
 * The top of an item page, the same for snippets, notes and credentials: an engraved kicker
 * ("SNIPPET · JAVASCRIPT"), the title with the actions on its right, the metadata line, and an
 * optional description. The new and edit forms (FormBar) use the same layout, so the title stays
 * put when you press Edit.
 */
export function ItemHeader({
  kicker,
  title,
  actions,
  meta,
  description,
}: {
  kicker: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  description?: string | null;
}) {
  return (
    <header className="space-y-2">
      <p className="engraved flex h-5 items-center gap-1.5">{kicker}</p>
      <div className="flex items-center gap-4">
        <h1 className="min-w-0 flex-1 text-title font-semibold break-words">{title}</h1>
        {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
      </div>
      {meta}
      {description && <p className="max-w-[68ch] pt-1 text-body text-text-2">{description}</p>}
    </header>
  );
}

/** The thin rule between the quiet icon actions and Edit. */
export function ActionDivider() {
  return <span className="mx-2 h-4.5 w-px bg-line" aria-hidden />;
}

/** The page's one primary action. */
export function EditLink({ href }: { href: string }) {
  return (
    <Link href={href} className={button({ variant: "primary" })}>
      Edit
    </Link>
  );
}

/**
 * Shown above the header on an older version: a slim strip rather than a box, so it doesn't
 * compete with Edit. `restore` is the form that saves this version as a new one.
 */
export function OldVersionBar({ version, latest, latestHref, restore }: { version: number; latest: number; latestHref: string; restore: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border-l-2 border-accent bg-well px-4 py-2.5 text-ui sm:flex-row sm:items-center">
      <p className="flex-1 text-text-2">
        {"Viewing "}
        <span className="font-mono text-text">{`v${version}`}</span>
        {` of ${latest}.`}
      </p>
      <div className="flex gap-2">
        <Link href={latestHref} className={button({ variant: "ghost", size: "sm" })}>
          View latest
        </Link>
        {restore}
      </div>
    </div>
  );
}

/** A labelled value in an item's Details dialog. */
export function DetailRow({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-baseline gap-3 py-2">
      <dt className="engraved">{label}</dt>
      <dd className={`min-w-0 break-words text-text-2 ${mono ? "font-mono text-meta" : "text-ui"}`}>{children}</dd>
    </div>
  );
}

/** A titled block in the Details dialog: the agent prompt, dependencies, instructions. */
export function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="engraved">{label}</h2>
      {children}
    </section>
  );
}
