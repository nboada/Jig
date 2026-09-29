const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

const SHORT: [string, number][] = [
  ["y", 31_536_000],
  ["mo", 2_592_000],
  ["w", 604_800],
  ["d", 86_400],
  ["h", 3_600],
  ["m", 60],
];

/** A compact relative time for dense rows: "2h", "3d", "1w", "2mo". "now" under a minute. */
export function timeAgoShort(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  for (const [unit, size] of SHORT) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${unit}`;
  }
  return "now";
}

const dateTime = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: process.env.JIG_TIMEZONE || "Australia/Sydney",
});

export function formatDate(iso: string): string {
  return dateTime.format(new Date(iso));
}

const shortDate = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "3 Oct, 1:04 pm", in the viewer's own time zone (for places rendered in the browser). */
export function formatDateShort(iso: string): string {
  return shortDate.format(new Date(iso));
}

/** "mcp:Claude Code" -> "Claude Code (MCP)", "web" -> "Dashboard". */
export function formatSource(source: string): string {
  if (source === "web") return "Dashboard";
  if (source.startsWith("mcp:")) return `${source.slice(4)} (MCP)`;
  return source;
}

/** The URL when it is a plain web link, so stored text can never become a javascript: link. */
export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/** "1 snippet", "4 snippets"; lists stop at 100 items, so a full list reads "100+ snippets". */
export function countLabel(count: number, noun: string, cap = 100): string {
  if (count >= cap) return `${cap}+ ${noun}s`;
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Markdown as one line of plain text, for previews: drops heading, list, checkbox and quote
 * markers, emphasis and code ticks, keeps link text, and collapses whitespace.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/^```.*$/gm, "")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
