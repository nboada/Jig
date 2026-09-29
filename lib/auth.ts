import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import { createSession, readSession, SESSION_COOKIE, SESSION_IDLE_SECONDS, SESSION_RENEW_SECONDS, type Session } from "./session";

/** This request's session, checked once per request however many times it's asked for. */
const currentSession = cache(async (): Promise<Session | null> => {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  return readSession(await getDb(), value);
});

/**
 * The real guard for every server action, layout and page under app/(app); the proxy only does
 * the optimistic redirect.
 */
export async function requireAuth(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}

const sessionCookie = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge,
  path: "/",
});

/** Signs this browser in. Server actions only (it sets a cookie). */
export async function startSession(): Promise<void> {
  const { value, maxAge } = await createSession(await getDb());
  (await cookies()).set(SESSION_COOKIE, value, sessionCookie(maxAge));
}

/**
 * Restarts the session's week once it's a day old, up to its 30-day limit, so a session only
 * runs out after a week away. Server actions only.
 */
export async function renewSession(session: Session, now = Date.now()): Promise<void> {
  const secondsLeft = session.expires - Math.floor(now / 1000);
  if (secondsLeft > SESSION_IDLE_SECONDS - SESSION_RENEW_SECONDS) return;
  const { value, maxAge } = await createSession(await getDb(), now, session.issuedAt);
  // Past the 30-day limit's last week, renewing gains nothing.
  if (Math.floor(now / 1000) + maxAge <= session.expires) return;
  (await cookies()).set(SESSION_COOKIE, value, sessionCookie(maxAge));
}
