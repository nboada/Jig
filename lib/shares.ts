import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getCredential, revealField, type Credential } from "./credentials";
import type { Db, Row } from "./db";
import { getNote, type Note } from "./notes";
import { getSnippet, SnippetError, type Snippet } from "./snippets";

/**
 * Share links: a long random token in a URL (/s/<token>) that shows one item read-only. Only
 * the token's SHA-256 is stored, so a link is shown once, when it is made. Links can expire,
 * stop after a number of views, and be revoked. Credential links also need a passcode, which
 * is stored as a scrypt hash and locks the link after MAX_FAILED wrong tries.
 *
 * lib/mcp.ts must never import this module: it reads credentials.
 */

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export type ShareKind = "snippets" | "notes" | "credentials";

/** How long a link lasts, in seconds; null never expires (it can still be revoked). */
export const EXPIRIES = { "1h": 3600, "24h": 86_400, "7d": 604_800, "30d": 2_592_000, never: null } as const;
export type Expiry = keyof typeof EXPIRIES;

/** Wrong passcodes a credential link takes before it locks for good. */
export const MAX_FAILED = 5;

export type Share = {
  id: string;
  kind: ShareKind;
  /** The shared item's id (not its slug), so a new item under an old name never inherits a link. */
  itemId: string;
  label: string;
  maxViews: number | null;
  views: number;
  expiresAt: string | null;
  createdAt: string;
  revoked: boolean;
  protected: boolean;
  failedAttempts: number;
};

/** Why a link can or can't be opened right now. */
export type ShareStatus = "open" | "expired" | "revoked" | "used" | "locked";

export type SharedItem =
  | { kind: "snippets"; snippet: Snippet }
  | { kind: "notes"; note: Note }
  | { kind: "credentials"; credential: Credential; secrets: Record<string, string> };

const TABLES: Record<ShareKind, string> = { snippets: "snippets", notes: "notes", credentials: "credentials" };

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

function toShare(row: Row): Share {
  return {
    id: row.id as string,
    kind: row.kind as ShareKind,
    itemId: row.item_id as string,
    label: row.label as string,
    maxViews: row.max_views == null ? null : Number(row.max_views),
    views: Number(row.views),
    expiresAt: row.expires_at ? new Date(row.expires_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
    revoked: row.revoked_at != null,
    protected: row.passcode_hash != null,
    failedAttempts: Number(row.failed_attempts),
  };
}

/** Whether a link can be opened now; passes (lib/share-pass.ts) apply the same rules. */
export function shareStatus(share: Share, now = Date.now()): ShareStatus {
  if (share.revoked) return "revoked";
  if (share.failedAttempts >= MAX_FAILED) return "locked";
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= now) return "expired";
  if (share.maxViews != null && share.views >= share.maxViews) return "used";
  return "open";
}

async function itemId(db: Db, kind: ShareKind, slug: string): Promise<string> {
  const rows = await db.query(`SELECT id FROM ${TABLES[kind]} WHERE slug = $1`, [slug]);
  if (!rows[0]) throw new SnippetError(`Nothing called "${slug}" to share.`, "not_found");
  return rows[0].id as string;
}

// Passcodes avoid look-alike characters (0/O, 1/I/L) so they survive being read out or retyped.
const PASSCODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makePasscode(): string {
  const bytes = randomBytes(8);
  const chars = [...bytes].map((b) => PASSCODE_ALPHABET[b % PASSCODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Case, spaces and dashes don't matter when typing a passcode back in. */
const normalizePasscode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(normalizePasscode(passcode), salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function passcodeMatches(passcode: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(normalizePasscode(passcode), Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export type ShareOptions = { expiry: Expiry; maxViews: number | null; label?: string };

/**
 * Makes a link to an item. Returns the token (for the URL) and, for credentials, the passcode;
 * neither can be read back later.
 */
export async function createShare(
  db: Db,
  kind: ShareKind,
  slug: string,
  options: ShareOptions,
): Promise<{ token: string; passcode?: string; share: Share }> {
  if (!(options.expiry in EXPIRIES)) throw new SnippetError("Pick how long the link lasts.", "invalid");
  if (options.maxViews != null && !(Number.isInteger(options.maxViews) && options.maxViews >= 1 && options.maxViews <= 100)) {
    throw new SnippetError("A view limit is a whole number from 1 to 100.", "invalid");
  }
  const id = await itemId(db, kind, slug);
  const token = randomBytes(24).toString("base64url");
  const passcode = kind === "credentials" ? makePasscode() : undefined;
  const rows = await db.query(
    `INSERT INTO shares (id, token_hash, kind, item_id, label, passcode_hash, max_views, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::int IS NULL THEN NULL ELSE now() + make_interval(secs => $8::int) END)
     RETURNING *`,
    [
      crypto.randomUUID(),
      await sha256(token),
      kind,
      id,
      (options.label ?? "").trim().slice(0, 80),
      passcode ? await hashPasscode(passcode) : null,
      options.maxViews,
      EXPIRIES[options.expiry],
    ],
  );
  return { token, passcode, share: toShare(rows[0]) };
}

/** An item's links, newest first, including expired and revoked ones. */
export async function listShares(db: Db, kind: ShareKind, slug: string): Promise<Share[]> {
  const rows = await db.query(
    `SELECT * FROM shares WHERE kind = $1 AND item_id = (SELECT id FROM ${TABLES[kind]} WHERE slug = $2)
     ORDER BY created_at DESC`,
    [kind, slug],
  );
  return rows.map(toShare);
}

export async function revokeShare(db: Db, id: string): Promise<void> {
  await db.query(`UPDATE shares SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
}

/** The link behind a token, or null for a token that was never issued. Counts nothing. */
export async function findShare(db: Db, token: string): Promise<Share | null> {
  const rows = await db.query(`SELECT * FROM shares WHERE token_hash = $1`, [await sha256(token)]);
  return rows[0] ? toShare(rows[0]) : null;
}

/** Checks a credential link's passcode; a wrong one counts towards locking the link. */
export async function checkPasscode(db: Db, share: Share, passcode: string): Promise<boolean> {
  const rows = await db.query(`SELECT passcode_hash FROM shares WHERE id = $1`, [share.id]);
  const stored = rows[0]?.passcode_hash as string | null | undefined;
  if (!stored) return true;
  if (await passcodeMatches(passcode, stored)) return true;
  await db.query(`UPDATE shares SET failed_attempts = failed_attempts + 1 WHERE id = $1`, [share.id]);
  return false;
}

/**
 * Counts a view, only if the link is still open. One statement, so two people opening a
 * one-view link at the same moment can't both get in. Returns false when it may not be viewed.
 */
export async function recordView(db: Db, share: Share): Promise<boolean> {
  const rows = await db.query(
    `UPDATE shares SET views = views + 1
     WHERE id = $1 AND revoked_at IS NULL AND failed_attempts < $2
       AND (expires_at IS NULL OR expires_at > now())
       AND (max_views IS NULL OR views < max_views)
     RETURNING id`,
    [share.id, MAX_FAILED],
  );
  return rows.length > 0;
}

/** The shared item as it is now, or null if it has since been deleted. */
export async function loadSharedItem(db: Db, share: Share): Promise<SharedItem | null> {
  const rows = await db.query(`SELECT slug FROM ${TABLES[share.kind]} WHERE id = $1`, [share.itemId]);
  const slug = rows[0]?.slug as string | undefined;
  if (!slug) return null;
  if (share.kind === "snippets") {
    const snippet = await getSnippet(db, slug);
    return snippet && { kind: "snippets", snippet };
  }
  if (share.kind === "notes") {
    const note = await getNote(db, slug);
    return note && { kind: "notes", note };
  }
  const credential = await getCredential(db, slug);
  if (!credential) return null;
  // revealField stays the only way to plaintext; a passcode has already been checked.
  const secrets: Record<string, string> = {};
  for (const field of credential.fields) {
    if (field.secret) secrets[field.id] = await revealField(db, slug, field.id);
  }
  return { kind: "credentials", credential, secrets };
}
