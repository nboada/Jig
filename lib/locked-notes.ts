import { decryptSecret, encryptSecret } from "./crypto";
import type { NoteCodec } from "./notes";
import type { Db } from "./db";
import { seal, unseal } from "./signing";

/**
 * Locked notes: the key helper that lib/notes.ts is handed, and the short unlock that lets the
 * dashboard use it (and reveal credential secrets). Dashboard only: lib/mcp.ts must never import
 * this (lib/mcp.test.ts checks).
 */

/** Encrypts each version bound to its note and version number, so ciphertext can't be moved. */
export const noteCodec: NoteCodec = {
  encode: (noteId, version, body) => encryptSecret(body, `note:${noteId}:${version}`),
  decode: (noteId, version, stored) => decryptSecret(stored, `note:${noteId}:${version}`),
};

/**
 * One unlock opens every locked note, and every credential's secrets, for 30 minutes or until the
 * browser closes (the cookie has no expiry of its own), so reading a few doesn't mean a Touch ID
 * each. It belongs to the session it was made in, so signing out ends it too.
 */
export const UNLOCK_COOKIE = "jig_unlock";
export const UNLOCK_SECONDS = 30 * 60;

export async function makeUnlock(db: Db, sessionIssuedAt: number, now = Date.now()) {
  const value = await seal(db, "unlock", [String(sessionIssuedAt)], Math.floor(now / 1000) + UNLOCK_SECONDS);
  return { value, maxAge: UNLOCK_SECONDS };
}

export async function isUnlockValid(db: Db, value: string | undefined, sessionIssuedAt: number, now = Date.now()): Promise<boolean> {
  const fields = await unseal(db, "unlock", value, now);
  return fields?.length === 1 && fields[0] === String(sessionIssuedAt);
}

/** Whether this browser unlocked in the last 30 minutes, in this session (and hasn't been closed since). */
export async function isUnlocked(): Promise<boolean> {
  const [{ cookies }, { requireAuth }, { getDb }] = await Promise.all([import("next/headers"), import("./auth"), import("./db")]);
  const session = await requireAuth();
  return isUnlockValid(await getDb(), (await cookies()).get(UNLOCK_COOKIE)?.value, session.issuedAt);
}

/** The key helper, but only while unlocked; otherwise locked notes stay unreadable. */
export async function unlockedCodec(): Promise<NoteCodec | undefined> {
  return (await isUnlocked()) ? noteCodec : undefined;
}
