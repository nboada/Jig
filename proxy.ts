import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "./lib/session";

export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  if (request.nextUrl.pathname !== "/") login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, the MCP endpoint (token auth) and static files.
  matcher: ["/((?!login|api/mcp|_next/|favicon.ico|icon.svg).*)"],
};
