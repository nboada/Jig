import Link from "next/link";
import { PinIcon } from "@/components/NavIcons";

/**
 * A grid card, the same anatomy for snippets, notes and credentials: an engraved kicker (the
 * language, "Note" or the site), the pin, the title, up to three lines of body, then the
 * metadata line at the foot.
 */
export function Card({
  href,
  kicker,
  pinned = false,
  title,
  body,
  meta,
}: {
  href: string;
  kicker: React.ReactNode;
  pinned?: boolean;
  title: string;
  body?: React.ReactNode;
  meta: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex h-full min-h-48 flex-col gap-2 rounded-xl border border-line bg-panel p-4 transition hover:-translate-y-px hover:border-line-strong"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="engraved flex min-w-0 items-center gap-1.5 truncate">{kicker}</span>
        {pinned && <PinIcon className="size-3.5 shrink-0 fill-current text-accent" />}
      </span>
      <span className="text-[15px] leading-[21px] font-medium text-text">{title}</span>
      {body && <span className="line-clamp-3 text-ui text-text-2">{body}</span>}
      <span className="mt-auto pt-2">{meta}</span>
    </Link>
  );
}
