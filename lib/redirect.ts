const CONTROL = /[\u0000-\u001f\u007f]/g;

function sameSitePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

export function safeNext(value: unknown): string {
  const next = typeof value === "string" ? value.replace(CONTROL, "") : "";
  if (!sameSitePath(next)) return "/";
  try {
    if (!sameSitePath(decodeURIComponent(next).replace(CONTROL, ""))) return "/";
    const url = new URL(next, "http://x");
    if (url.origin !== "http://x") return "/";
    const out = url.pathname + url.search + url.hash;
    return sameSitePath(out) && sameSitePath(decodeURIComponent(out).replace(CONTROL, "")) ? out : "/";
  } catch {
    return "/";
  }
}
