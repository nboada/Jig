/**
 * Encrypts credential secrets at rest with AES-256-GCM. The key comes from
 * JIG_ENCRYPTION_KEY (32 bytes, base64). Each value is bound to its
 * credential and field through the additional data, so ciphertext copied to
 * another place in the database does not decrypt.
 */

const PREFIX = "v1";

export class CredentialsUnavailable extends Error {
  constructor() {
    super("Credentials need JIG_ENCRYPTION_KEY: 32 random bytes in base64. Generate one with: openssl rand -base64 32");
  }
}

export class DecryptError extends Error {
  constructor() {
    super("Can't decrypt this value. Was the encryption key changed?");
  }
}

const encoder = new TextEncoder();
const fromBase64 = (value: string, encoding: "base64" | "base64url"): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Buffer.from(value, encoding));
const toBase64Url = (bytes: ArrayLike<number>): string => Buffer.from(bytes).toString("base64url");

// Standard base64 of exactly 32 bytes: 43 base64 characters plus one "=" pad character.
// `Buffer.from(value, "base64")` silently skips characters outside its alphabet, so without
// this check a typo'd key could still decode to 32 bytes and look valid.
const KEY_SHAPE = /^[A-Za-z0-9+/]{43}=$/;

function keyBytes(): Uint8Array<ArrayBuffer> | null {
  const value = process.env.JIG_ENCRYPTION_KEY?.trim();
  if (!value || !KEY_SHAPE.test(value)) return null;
  const bytes = fromBase64(value, "base64");
  return bytes.length === 32 ? bytes : null;
}

export function encryptionReady(): boolean {
  return keyBytes() !== null;
}

export function assertEncryptionReady(): void {
  if (!encryptionReady()) throw new CredentialsUnavailable();
}

let cached: { raw: string; key: Promise<CryptoKey> } | undefined;

function key(): Promise<CryptoKey> {
  const raw = process.env.JIG_ENCRYPTION_KEY?.trim() ?? "";
  if (cached?.raw !== raw) {
    const bytes = keyBytes();
    if (!bytes) return Promise.reject(new CredentialsUnavailable());
    cached = { raw, key: crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]) };
  }
  return cached.key;
}

export async function encryptSecret(plain: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    await key(),
    encoder.encode(plain),
  );
  return `${PREFIX}:${toBase64Url(iv)}:${toBase64Url(new Uint8Array(data))}`;
}

export async function decryptSecret(stored: string, context: string): Promise<string> {
  const [prefix, iv, data] = stored.split(":");
  if (prefix !== PREFIX || !iv || !data) throw new DecryptError();
  const k = await key();
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv, "base64url"), additionalData: encoder.encode(context) },
      k,
      fromBase64(data, "base64url"),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new DecryptError();
  }
}
