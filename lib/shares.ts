import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getCredential, revealField, type Credential } from "./credentials";
import { decryptSecret, encryptionReady, encryptSecret } from "./crypto";
import type { Db, Row } from "./db";
import { getNote, type Note } from "./notes";
import { sha256 } from "./signing";
import { getSnippet, SnippetError, type Snippet } from "./snippets";


type ScryptOptions = { N: number; r: number; p: number; maxmem: number };
const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number, options?: ScryptOptions) => Promise<Buffer>;

const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export type ShareKind = "snippets" | "notes" | "credentials";

export const EXPIRIES = { "1h": 3600, "24h": 86_400, "7d": 604_800, "30d": 2_592_000, never: null } as const;
export type Expiry = keyof typeof EXPIRIES;

export const MAX_FAILED = 5;

export type Share = {
  id: string;
  kind: ShareKind;
  itemId: string;
  label: string;
  maxViews: number | null;
  views: number;
  expiresAt: string | null;
  createdAt: string;
  revoked: boolean;
  protected: boolean;
  failedAttempts: number;
  recoverable: boolean;
};

export type ShareStatus = "open" | "expired" | "revoked" | "used" | "locked";

export type SharedItem =
  | { kind: "snippets"; snippet: Snippet }
  | { kind: "notes"; note: Note }
  | { kind: "credentials"; credential: Credential; secrets: Record<string, string> };

const TABLES: Record<ShareKind, string> = { snippets: "snippets", notes: "notes", credentials: "credentials" };

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
    recoverable: row.token_enc != null,
  };
}

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

const PASSCODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makePasscode(): string {
  const chars = Array.from({ length: 8 }, () => PASSCODE_ALPHABET[randomInt(PASSCODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

const normalizePasscode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(normalizePasscode(passcode), salt, 32, SCRYPT);
  return `scrypt:${Math.log2(SCRYPT.N)}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function passcodeMatches(passcode: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  const [salt, hash] = parts.length === 6 ? parts.slice(4) : parts;
  const options =
    parts.length === 6 ? { N: 2 ** Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), maxmem: SCRYPT.maxmem } : undefined;
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(normalizePasscode(passcode), Buffer.from(salt, "hex"), expected.length, options);
  return timingSafeEqual(actual, expected);
}

export type ShareOptions = { expiry: Expiry; maxViews: number | null; label?: string };

export async function createShare(
  db: Db,
  kind: ShareKind,
  slug: string,
  options: ShareOptions,
): Promise<{ token: string; passcode?: string; share: Share }> {
  if (!Object.hasOwn(EXPIRIES, options.expiry)) throw new SnippetError("Pick how long the link lasts.", "invalid");
  if (options.maxViews != null && !(Number.isInteger(options.maxViews) && options.maxViews >= 1 && options.maxViews <= 100)) {
    throw new SnippetError("A view limit is a whole number from 1 to 100.", "invalid");
  }
  const id = await itemId(db, kind, slug);
  if (kind === "notes" && (await getNote(db, slug))?.locked) {
    throw new SnippetError("Locked notes can't be shared. Remove the lock first.", "invalid");
  }
  const token = randomBytes(24).toString("base64url");
  const passcode = kind === "credentials" ? makePasscode() : undefined;
  const shareId = crypto.randomUUID();
  const keep = encryptionReady();
  const rows = await db.query(
    `INSERT INTO shares (id, token_hash, kind, item_id, label, passcode_hash, max_views, expires_at, token_enc, passcode_enc)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::int IS NULL THEN NULL ELSE now() + make_interval(secs => $8::int) END, $9, $10)
     RETURNING *`,
    [
      shareId,
      await sha256(token),
      kind,
      id,
      (options.label ?? "").trim().slice(0, 80),
      passcode ? await hashPasscode(passcode) : null,
      options.maxViews,
      EXPIRIES[options.expiry],
      keep ? await encryptSecret(token, `share:${shareId}:token`) : null,
      keep && passcode ? await encryptSecret(passcode, `share:${shareId}:passcode`) : null,
    ],
  );
  return { token, passcode, share: toShare(rows[0]) };
}

export async function listShares(db: Db, kind: ShareKind, slug: string): Promise<Share[]> {
  const rows = await db.query(
    `SELECT * FROM shares WHERE kind = $1 AND item_id = (SELECT id FROM ${TABLES[kind]} WHERE slug = $2)
     ORDER BY created_at DESC`,
    [kind, slug],
  );
  return rows.map(toShare);
}

export async function revealShare(db: Db, id: string): Promise<{ kind: ShareKind; token: string; passcode?: string }> {
  const rows = await db.query(`SELECT id, kind, token_enc, passcode_enc FROM shares WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row?.token_enc) throw new SnippetError("This link was only shown when it was made.", "not_found");
  return {
    kind: row.kind as ShareKind,
    token: await decryptSecret(row.token_enc as string, `share:${id}:token`),
    ...(row.passcode_enc ? { passcode: await decryptSecret(row.passcode_enc as string, `share:${id}:passcode`) } : {}),
  };
}

export async function deleteShare(db: Db, id: string): Promise<void> {
  await db.query(`DELETE FROM shares WHERE id = $1`, [id]);
}

export async function restoreShare(db: Db, id: string): Promise<void> {
  await db.query(`UPDATE shares SET revoked_at = NULL WHERE id = $1`, [id]);
}

export async function revokeShare(db: Db, id: string): Promise<void> {
  await db.query(`UPDATE shares SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
}

export async function findShare(db: Db, token: string): Promise<Share | null> {
  const rows = await db.query(`SELECT * FROM shares WHERE token_hash = $1`, [await sha256(token)]);
  return rows[0] ? toShare(rows[0]) : null;
}

export async function checkPasscode(db: Db, share: Share, passcode: string): Promise<{ ok: boolean; left: number }> {
  if (!share.protected) return { ok: true, left: MAX_FAILED };
  const rows = await db.query(
    `UPDATE shares SET failed_attempts = failed_attempts + 1
     WHERE id = $1 AND failed_attempts < $2 AND passcode_hash IS NOT NULL
     RETURNING passcode_hash, failed_attempts`,
    [share.id, MAX_FAILED],
  );
  if (!rows[0]) return { ok: false, left: 0 };
  if (await passcodeMatches(passcode, rows[0].passcode_hash as string)) {
    await db.query(`UPDATE shares SET failed_attempts = failed_attempts - 1 WHERE id = $1 AND failed_attempts > 0`, [share.id]);
    return { ok: true, left: MAX_FAILED - Number(rows[0].failed_attempts) + 1 };
  }
  return { ok: false, left: MAX_FAILED - Number(rows[0].failed_attempts) };
}

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
    return note && !note.locked ? { kind: "notes", note } : null;
  }
  const credential = await getCredential(db, slug);
  if (!credential) return null;
  const secrets: Record<string, string> = {};
  for (const field of credential.fields) {
    if (field.secret) secrets[field.id] = await revealField(db, slug, field.id);
  }
  return { kind: "credentials", credential, secrets };
}
