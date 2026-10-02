import type { Body } from "./api";
import { failure, type Caller } from "./api-http";
import { encryptionReady } from "./crypto";
import type { Db } from "./db";
import { compareNotes } from "./diff";
import { noteCodec, UNLOCK_SECONDS } from "./locked-notes";
import { getNote, getNoteVersionPair, listNoteVersions, setNoteLocked, updateNote } from "./notes";
import { authenticationOptions, verifyPasskey, type Site } from "./passkeys";
import { checkLogin, clearFailures, recordFailure } from "./ratelimit";
import { checkPassword, passwordProblem, sessionsValidAfter } from "./session";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { seal, sha256, unseal } from "./signing";
import { SnippetError } from "./snippets";
import type { NotePatch } from "./validation";

// Everything in the app API that can read a locked note's text. Kept apart from lib/api.ts so that module,
// like lib/mcp.ts, can never reach the note key.

export const UNLOCK_HEADER = "x-jig-unlock";
const CODE_PREFIX = "jigo_uc_";
const CODE_TTL_SECONDS = 300;

const random = () => CODE_PREFIX + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

export type AppGrant = { id: string; name: string; createdAt: string };

/** The app's newest sign-in with app access. Unlocks are only offered to apps the owner already connected. */
export async function appGrantFor(db: Db, clientId: string): Promise<AppGrant | null> {
  const rows = await db.query<{ id: string; name: string; created_at: string }>(
    `SELECT id, name, created_at FROM oauth_grants WHERE client_id = $1 AND scope = 'app' ORDER BY created_at DESC LIMIT 1`,
    [clientId],
  );
  return rows[0] ? { id: rows[0].id, name: rows[0].name, createdAt: new Date(rows[0].created_at).toISOString() } : null;
}

/** Called by the dashboard's unlock page once the owner has unlocked there. */
export async function issueUnlockCode(db: Db, clientId: string): Promise<string> {
  const grant = await appGrantFor(db, clientId);
  if (!grant) throw new SnippetError("That app isn't signed in to this Jig. Sign in from the app first.", "invalid");
  if (!encryptionReady()) throw new SnippetError("Locked notes need JIG_ENCRYPTION_KEY on the server.", "invalid");
  const code = random();
  await db.query(
    `WITH expired AS (DELETE FROM oauth_unlock_codes WHERE expires_at < now())
     INSERT INTO oauth_unlock_codes (code_hash, client_id, grant_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
    [await sha256(code), clientId, grant.id, CODE_TTL_SECONDS],
  );
  return code;
}

/** Trades a one-use code for an unlock token bound to the caller's grant. */
export async function exchangeUnlockCode(db: Db, caller: Caller, body: Body, now = Date.now()) {
  const code = typeof body.code === "string" ? body.code : "";
  const rows = code.startsWith(CODE_PREFIX)
    ? await db.query(
        `DELETE FROM oauth_unlock_codes WHERE code_hash = $1 AND client_id = $2 AND grant_id = $3 RETURNING created_at, expires_at`,
        [await sha256(code), caller.clientId, caller.grantId],
      )
    : [];
  const row = rows[0] as { created_at: string; expires_at: string } | undefined;
  if (!row || new Date(row.expires_at).getTime() < now) {
    throw new SnippetError("That unlock didn't work. Try unlocking again.", "invalid");
  }
  return unlockToken(db, caller.grantId, new Date(row.created_at).getTime(), now);
}

// Seal the moment the owner approved, so "Sign out everywhere" after approval still ends it.
async function unlockToken(db: Db, grantId: string, approved: number, now: number) {
  const expires = Math.floor(now / 1000) + UNLOCK_SECONDS;
  return { unlockToken: await seal(db, "app-unlock", [grantId, String(approved)], expires), expiresIn: UNLOCK_SECONDS };
}

// The app can also unlock natively, with the same passkey or password as the dashboard, instead of the browser sheet.
// Passkey challenges are kept (hashed) with the unlock codes, bound to the grant and used once.
const challengeKey = (challenge: string) => sha256(`passkey:${challenge}`);

async function guard(db: Db, ip: string, everywhere: boolean) {
  await recordFailure(db, ip);
  const { blocked, retryAfterMinutes } = await checkLogin(db, ip, new Date(), { everywhere });
  if (blocked) {
    throw new SnippetError(`Too many attempts, try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`, "invalid");
  }
}

export async function passkeyUnlockOptions(db: Db, caller: Caller, site: Site) {
  if (!encryptionReady()) throw new SnippetError("Locked notes need JIG_ENCRYPTION_KEY on the server.", "invalid");
  const options = await authenticationOptions(site);
  await db.query(
    `WITH expired AS (DELETE FROM oauth_unlock_codes WHERE expires_at < now())
     INSERT INTO oauth_unlock_codes (code_hash, client_id, grant_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
    [await challengeKey(options.challenge), caller.clientId, caller.grantId, CODE_TTL_SECONDS],
  );
  return options;
}

export async function unlockWithPasskey(db: Db, caller: Caller, site: Site, body: Body, ip: string, now = Date.now()) {
  if (!encryptionReady()) throw new SnippetError("Locked notes need JIG_ENCRYPTION_KEY on the server.", "invalid");
  await guard(db, ip, false);
  const response = body.response as AuthenticationResponseJSON | undefined;
  const clientData = typeof response?.response?.clientDataJSON === "string" ? response.response.clientDataJSON : "";
  const challenge = (() => {
    try {
      return String(JSON.parse(Buffer.from(clientData, "base64url").toString("utf8")).challenge ?? "");
    } catch {
      return "";
    }
  })();
  const rows = challenge
    ? await db.query(
        `DELETE FROM oauth_unlock_codes WHERE code_hash = $1 AND client_id = $2 AND grant_id = $3 AND expires_at > now() RETURNING code_hash`,
        [await challengeKey(challenge), caller.clientId, caller.grantId],
      )
    : [];
  if (!rows.length) throw new SnippetError("That unlock expired. Try again.", "invalid");
  if (!(await verifyPasskey(db, site, response!, challenge))) {
    throw new SnippetError("That passkey didn't work. Try again, or use your password.", "invalid");
  }
  await clearFailures(db, ip);
  return unlockToken(db, caller.grantId, now, now);
}

export async function unlockWithPassword(db: Db, caller: Caller, body: Body, ip: string, now = Date.now()) {
  if (!encryptionReady()) throw new SnippetError("Locked notes need JIG_ENCRYPTION_KEY on the server.", "invalid");
  const problem = passwordProblem();
  if (problem) throw new SnippetError(problem, "invalid");
  await guard(db, ip, true);
  if (typeof body.password !== "string" || !checkPassword(body.password)) throw new SnippetError("Wrong password.", "invalid");
  await clearFailures(db, ip);
  return unlockToken(db, caller.grantId, now, now);
}

export async function unlockValid(db: Db, caller: Caller, token: string | null, now = Date.now()): Promise<boolean> {
  const fields = await unseal(db, "app-unlock", token ?? undefined, now);
  if (fields?.length !== 2 || fields[0] !== caller.grantId) return false;
  return Number(fields[1]) > (await sessionsValidAfter(db));
}

/** Gate for `respond`: refuses with 403 "locked" unless the request carries a valid unlock token. */
export const requireUnlock = (db: Db, req: Request) => async (caller: Caller) =>
  (await unlockValid(db, caller, req.headers.get(UNLOCK_HEADER)))
    ? null
    : failure("locked", "Unlock locked notes to continue.", 403);

function version(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < 1 || n > 2_147_483_647) throw new SnippetError("v must be a whole number.", "invalid");
  return n;
}

async function lockedNote(db: Db, slug: string, v?: number) {
  const note = await getNote(db, slug, v, noteCodec);
  if (!note || !note.locked) throw new SnippetError(`No locked note with the slug "${slug}".`, "not_found");
  return note;
}

export const lockedNotesApi = {
  get: (db: Db, slug: string, q: URLSearchParams) => lockedNote(db, slug, version(q.get("v"))),

  async update(db: Db, slug: string, body: Body, source: string) {
    await lockedNote(db, slug);
    return updateNote(db, slug, body as NotePatch, source, noteCodec);
  },

  async versions(db: Db, slug: string) {
    await lockedNote(db, slug);
    return listNoteVersions(db, slug);
  },

  async diff(db: Db, slug: string, q: URLSearchParams) {
    await lockedNote(db, slug);
    const from = version(q.get("from"));
    if (from === undefined) throw new SnippetError("from is required.", "invalid");
    const [a, b] = await getNoteVersionPair(db, slug, from, version(q.get("to")), noteCodec);
    return compareNotes(a, b);
  },

  /** Locks or unlocks any note; both directions need the note key. */
  async lock(db: Db, slug: string, body: Body) {
    if (typeof body.locked !== "boolean") throw new SnippetError("locked must be true or false.", "invalid");
    if (!encryptionReady()) throw new SnippetError("Locking notes needs JIG_ENCRYPTION_KEY on the server.", "invalid");
    if (!(await getNote(db, slug))) throw new SnippetError(`No note with the slug "${slug}".`, "not_found");
    await setNoteLocked(db, slug, body.locked, noteCodec);
    return getNote(db, slug, undefined, noteCodec);
  },
};
