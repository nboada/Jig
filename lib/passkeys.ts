import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Db } from "./db";
import { safeEqual, signValue } from "./session";
import { SnippetError } from "./snippets";

/**
 * Passkeys (Touch ID, Face ID, a security key) for the single dashboard user: signing in and
 * unlocking locked notes. A passkey belongs to one site (its RP ID is the host name), so one made
 * on the deployed site doesn't work on localhost and vice versa.
 */

export type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

/** The site a passkey is tied to, from the request's host and scheme. */
export type Site = { rpID: string; origin: string };

export function siteFrom(host: string | null, proto: string | null): Site {
  const hostname = (host ?? "localhost").split(",")[0].trim();
  const scheme = (proto ?? "").split(",")[0].trim() || (hostname.startsWith("localhost") ? "http" : "https");
  return { rpID: hostname.replace(/:\d+$/, ""), origin: `${scheme}://${hostname}` };
}

// The one user every passkey belongs to. Stable, so a device offers the same entry each time.
const USER_ID = new TextEncoder().encode("jig-owner");

export async function listPasskeys(db: Db): Promise<Passkey[]> {
  const rows = await db.query(`SELECT id, name, created_at, last_used_at FROM passkeys ORDER BY created_at`);
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    createdAt: new Date(r.created_at as string).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at as string).toISOString() : null,
  }));
}

export async function hasPasskeys(db: Db): Promise<boolean> {
  return (await db.query(`SELECT 1 FROM passkeys LIMIT 1`)).length > 0;
}

export async function removePasskey(db: Db, id: string): Promise<void> {
  await db.query(`DELETE FROM passkeys WHERE id = $1`, [id]);
}

export async function registrationOptions(db: Db, site: Site) {
  const existing = await db.query<{ id: string; transports: string[] }>(`SELECT id, transports FROM passkeys`);
  return generateRegistrationOptions({
    rpName: "Jig",
    rpID: site.rpID,
    userName: "Jig",
    userID: USER_ID,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports as never })),
    // Discoverable, so signing in needs no username; verified, so it always asks for Touch ID.
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    // Ask for this device's own authenticator (Touch ID, Windows Hello) rather than letting the
    // browser default to "use a phone" with a QR code, which Brave does.
    preferredAuthenticatorType: "localDevice",
  });
}

export async function savePasskey(db: Db, site: Site, response: RegistrationResponseJSON, challenge: string, name: string) {
  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: site.origin,
    expectedRPID: site.rpID,
    requireUserVerification: true,
  });
  if (!verified || !registrationInfo) throw new SnippetError("The passkey couldn't be verified.", "invalid");
  const { credential } = registrationInfo;
  await db.query(
    `INSERT INTO passkeys (id, public_key, counter, transports, name) VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (id) DO NOTHING`,
    [
      credential.id,
      Buffer.from(credential.publicKey).toString("base64url"),
      credential.counter,
      JSON.stringify(credential.transports ?? []),
      name.trim().slice(0, 60) || "Passkey",
    ],
  );
}

/** Options for a sign-in or unlock. No allow-list: the device offers its Jig passkey itself. */
export function authenticationOptions(site: Site) {
  return generateAuthenticationOptions({ rpID: site.rpID, userVerification: "required" });
}

/** Checks a passkey sign-in or unlock against the stored public key. True only when it's genuine. */
export async function verifyPasskey(db: Db, site: Site, response: AuthenticationResponseJSON, challenge: string): Promise<boolean> {
  const rows = await db.query(`SELECT id, public_key, counter, transports FROM passkeys WHERE id = $1`, [response.id]);
  const stored = rows[0];
  if (!stored) return false;
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: site.origin,
      expectedRPID: site.rpID,
      requireUserVerification: true,
      credential: {
        id: stored.id as string,
        publicKey: new Uint8Array(Buffer.from(stored.public_key as string, "base64url")),
        counter: Number(stored.counter),
        transports: stored.transports as never,
      },
    });
    if (!verified) return false;
    await db.query(`UPDATE passkeys SET counter = $2, last_used_at = now() WHERE id = $1`, [
      stored.id,
      authenticationInfo.newCounter,
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The challenge travels in a short-lived signed cookie between asking for options and answering
 * them, since there's no server-side session to keep it in. Signed so it can't be swapped.
 */
export const CHALLENGE_COOKIE = "jig_webauthn";
export const CHALLENGE_SECONDS = 5 * 60;

export async function makeChallengeCookie(challenge: string, now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + CHALLENGE_SECONDS);
  return `${expires}.${challenge}.${await signValue(`webauthn:${expires}:${challenge}`)}`;
}

export async function readChallengeCookie(value: string | undefined, now = Date.now()): Promise<string | null> {
  if (!value) return null;
  const [expires, challenge, signature] = value.split(".");
  if (!expires || !challenge || !signature || Number(expires) * 1000 < now) return null;
  try {
    return safeEqual(signature, await signValue(`webauthn:${expires}:${challenge}`)) ? challenge : null;
  } catch {
    return null;
  }
}
