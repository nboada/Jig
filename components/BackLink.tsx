import Link from "next/link";

/** The link above a page title back to where it came from: an arrow and the destination's name. */
export function BackLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`group -ml-1.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-ui text-muted transition hover:bg-raised hover:text-text ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5 shrink-0 transition group-hover:-translate-x-0.5"
        aria-hidden
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      <span className="truncate">{children}</span>
    </Link>
  );
}
