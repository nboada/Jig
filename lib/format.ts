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

const dateTime = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: process.env.SNIPPETA_TIMEZONE || "Australia/Sydney",
});

export function formatDate(iso: string): string {
  return dateTime.format(new Date(iso));
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
