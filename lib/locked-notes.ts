import { decryptSecret, encryptSecret } from "./crypto";
import type { NoteCodec } from "./notes";
import { safeEqual, signValue } from "./session";

/**
 * Locked notes: the key helper that lib/notes.ts is handed, and the short unlock that lets the
 * dashboard use it. Dashboard only: lib/mcp.ts must never import this (lib/mcp.test.ts checks).
 */

/** Encrypts each version bound to its note and version number, so ciphertext can't be moved. */
export const noteCodec: NoteCodec = {
  encode: (noteId, version, body) => encryptSecret(body, `note:${noteId}:${version}`),
  decode: (noteId, version, stored) => decryptSecret(stored, `note:${noteId}:${version}`),
};

/** One unlock opens every locked note for a few minutes, so reading a few doesn't mean a Touch ID each. */
export const UNLOCK_COOKIE = "jig_unlock";
export const UNLOCK_SECONDS = 5 * 60;

export async function makeUnlock(now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + UNLOCK_SECONDS);
  return { value: `${expires}.${await signValue(`note-unlock:${expires}`)}`, maxAge: UNLOCK_SECONDS };
}

export async function isUnlockValid(value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) * 1000 < now) return false;
  try {
    return safeEqual(signature, await signValue(`note-unlock:${expires}`));
  } catch {
    return false;
  }
}

/** Whether this browser unlocked the notes in the last few minutes. */
export async function notesUnlocked(): Promise<boolean> {
  const { cookies } = await import("next/headers");
  return isUnlockValid((await cookies()).get(UNLOCK_COOKIE)?.value);
}

/** The key helper, but only while the notes are unlocked; otherwise locked notes stay unreadable. */
export async function unlockedCodec(): Promise<NoteCodec | undefined> {
  return (await notesUnlocked()) ? noteCodec : undefined;
}
