import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import { createSession, readSession, SESSION_COOKIE, SESSION_IDLE_SECONDS, SESSION_RENEW_SECONDS, type Session } from "./session";

const currentSession = cache(async (): Promise<Session | null> => {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  return readSession(await getDb(), value);
});

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

export async function startSession(): Promise<void> {
  const { value, maxAge } = await createSession(await getDb());
  (await cookies()).set(SESSION_COOKIE, value, sessionCookie(maxAge));
}

export async function renewSession(session: Session, now = Date.now()): Promise<void> {
  const secondsLeft = session.expires - Math.floor(now / 1000);
  if (secondsLeft > SESSION_IDLE_SECONDS - SESSION_RENEW_SECONDS) return;
  const { value, maxAge } = await createSession(await getDb(), now, session.issuedAt);
  if (Math.floor(now / 1000) + maxAge <= session.expires) return;
  (await cookies()).set(SESSION_COOKIE, value, sessionCookie(maxAge));
}
