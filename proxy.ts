import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionLooksCurrent } from "./lib/session";

/*
 * Two jobs, on every page:
 * - An optimistic redirect to /login when there's no current session cookie. It can't check the
 *   signature (that needs the database), so it's never the guard: requireAuth() is, in every
 *   action, layout and page.
 * - A Content-Security-Policy with a fresh nonce, which Next puts on its own scripts. Every page
 *   is rendered per request already (they read cookies), so the nonce costs nothing extra.
 */

// Open without a session: the login page, share links (their token and passcode guard them), the
// app manifest and icons (fetched without cookies), and the OAuth endpoints apps call directly
// (discovery, registration, tokens). /oauth/authorize is not among them: approving needs a login.
const PUBLIC = /^\/(login|s\/|manifest\.webmanifest|icon\.svg|apple-icon|app-icons\/|favicon\.ico|\.well-known\/|oauth\/(register|token|revoke)$)/;

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // React's dev tools evaluate code; production never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Shiki's colours, CodeMirror and Tiptap all style elements inline.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!PUBLIC.test(pathname) && !sessionLooksCurrent(request.cookies.get(SESSION_COOKIE)?.value)) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Everything but the MCP endpoint (token auth, no pages) and Next's static files.
  matcher: ["/((?!api/mcp|_next/static|_next/image).*)"],
};
