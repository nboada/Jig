import { decryptSecret, encryptSecret } from "./crypto";
import type { NoteCodec } from "./notes";
import type { Db } from "./db";
import { seal, unseal } from "./signing";


export const noteCodec: NoteCodec = {
  encode: (noteId, version, body) => encryptSecret(body, `note:${noteId}:${version}`),
  decode: (noteId, version, stored) => decryptSecret(stored, `note:${noteId}:${version}`),
};

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

export async function isUnlocked(): Promise<boolean> {
  const [{ cookies }, { requireAuth }, { getDb }] = await Promise.all([import("next/headers"), import("./auth"), import("./db")]);
  const session = await requireAuth();
  return isUnlockValid(await getDb(), (await cookies()).get(UNLOCK_COOKIE)?.value, session.issuedAt);
}

export async function unlockedCodec(): Promise<NoteCodec | undefined> {
  return (await isUnlocked()) ? noteCodec : undefined;
}
