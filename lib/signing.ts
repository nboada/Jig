import type { Db } from "./db";


export type Purpose = "session" | "share-pass" | "webauthn" | "unlock" | "app-unlock";

const ROOT_SECRET = "signing-root";

async function provisionedSecret(db: Db): Promise<string> {
  const fresh = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const rows = await db.query<{ value: string }>(
    `WITH made AS (
       INSERT INTO app_secrets (name, value) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING value
     )
     SELECT value FROM made UNION ALL SELECT value FROM app_secrets WHERE name = $1`,
    [ROOT_SECRET, fresh],
  );
  if (rows[0]) return rows[0].value;
  const again = await db.query<{ value: string }>(`SELECT value FROM app_secrets WHERE name = $1`, [ROOT_SECRET]);
  if (!again[0]) throw new Error("Could not set up the signing secret.");
  return again[0].value;
}

const secrets = new WeakMap<Db, Promise<string>>();

function databaseSecret(db: Db): Promise<string> {
  let secret = secrets.get(db);
  if (!secret) {
    secret = provisionedSecret(db).catch((error) => {
      secrets.delete(db);
      throw error;
    });
    secrets.set(db, secret);
  }
  return secret;
}

function environmentSecret(): string {
  const value = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!value) throw new Error("Set ADMIN_PASSWORD (and optionally SESSION_SECRET) to use the dashboard.");
  return `${value}\u0000${process.env.JIG_ENCRYPTION_KEY?.trim() ?? ""}`;
}

const keys = new Map<string, Promise<CryptoKey>>();

async function keyFor(db: Db, purpose: Purpose): Promise<CryptoKey> {
  const root = `${await databaseSecret(db)}\u0000${environmentSecret()}`;
  const id = `${purpose}\u0000${root}`;
  let key = keys.get(id);
  if (!key) {
    key = (async () => {
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(root), "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(`jig:${purpose}`) },
        material,
        { name: "HMAC", hash: "SHA-256", length: 256 },
        false,
        ["sign", "verify"],
      );
    })();
    keys.set(id, key);
  }
  return key;
}

const bytes = (value: string) => new TextEncoder().encode(value);

export async function seal(db: Db, purpose: Purpose, fields: string[], expires: number): Promise<string> {
  if (fields.some((f) => f.includes("."))) throw new Error("Signed fields can't contain dots.");
  const body = [...fields, String(Math.floor(expires))].join(".");
  const signature = await crypto.subtle.sign("HMAC", await keyFor(db, purpose), bytes(body));
  return `${body}.${Buffer.from(signature).toString("base64url")}`;
}

export async function unseal(db: Db, purpose: Purpose, value: string | undefined, now = Date.now()): Promise<string[] | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length < 2) return null;
  const signature = parts.pop()!;
  const expires = Number(parts.at(-1));
  if (!Number.isFinite(expires) || expires * 1000 < now) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await keyFor(db, purpose),
      new Uint8Array(Buffer.from(signature, "base64url")),
      bytes(parts.join(".")),
    );
    return valid ? parts.slice(0, -1) : null;
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}
