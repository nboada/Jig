import Link from "next/link";

/** The link above a page title back to where it came from: an arrow and the destination's name. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group -ml-2 inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted transition hover:bg-raised hover:text-text"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 shrink-0 transition group-hover:-translate-x-0.5"
        aria-hidden
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      <span className="truncate">{children}</span>
    </Link>
  );
}
