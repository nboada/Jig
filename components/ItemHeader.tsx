import Link from "next/link";
import { Kbd } from "@/components/Kbd";
import { button } from "@/components/Button";

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
    <header className="flex flex-col gap-2 sm:block sm:space-y-2">
      <p className="engraved flex h-5 items-center gap-1.5">{kicker}</p>
      <div className="contents sm:flex sm:flex-row sm:items-center sm:gap-4">
        <h1 className="min-w-0 text-title font-semibold break-words sm:flex-1">{title}</h1>
        {actions && (
          <div className="order-1 mt-1 flex w-full shrink-0 items-center gap-0.5 sm:order-none sm:mt-0 sm:w-auto">{actions}</div>
        )}
      </div>
      {meta}
      {description && <p className="order-2 max-w-[68ch] pt-1 text-body text-text-2 sm:order-none">{description}</p>}
    </header>
  );
}

export function ActionDivider() {
  return <span className="ml-auto h-4.5 w-px sm:mx-2 sm:bg-line" aria-hidden />;
}

export function EditLink({ href }: { href: string }) {
  return (
    <Link href={href} className={button({ variant: "primary" })} title="Edit (E)">
      Edit
      <Kbd onAccent className="hidden sm:inline">
        E
      </Kbd>
    </Link>
  );
}

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

export function DetailRow({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-baseline gap-3 py-2">
      <dt className="engraved">{label}</dt>
      <dd className={`min-w-0 break-words text-text-2 ${mono ? "font-mono text-meta" : "text-ui"}`}>{children}</dd>
    </div>
  );
}

export function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="engraved">{label}</h2>
      {children}
    </section>
  );
}
