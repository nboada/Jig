/**
 * Encrypts credential secrets at rest with AES-256-GCM. The key comes from
 * SNIPPETA_ENCRYPTION_KEY (32 bytes, base64). Each value is bound to its
 * credential and field through the additional data, so ciphertext copied to
 * another place in the database does not decrypt.
 */

const PREFIX = "v1";

export class CredentialsUnavailable extends Error {
  constructor() {
    super("Credentials need SNIPPETA_ENCRYPTION_KEY: 32 random bytes in base64. Generate one with: openssl rand -base64 32");
  }
}

export class DecryptError extends Error {
  constructor() {
    super("Can't decrypt this value. Was the encryption key changed?");
  }
}

const encoder = new TextEncoder();
const fromBase64 = (value: string, encoding: "base64" | "base64url"): Uint8Array => new Uint8Array(Buffer.from(value, encoding));
const toBase64Url = (bytes: ArrayLike<number>): string => Buffer.from(bytes).toString("base64url");

function keyBytes(): Uint8Array | null {
  const value = process.env.SNIPPETA_ENCRYPTION_KEY?.trim();
  if (!value) return null;
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
  const raw = process.env.SNIPPETA_ENCRYPTION_KEY?.trim() ?? "";
  if (cached?.raw !== raw) {
    const bytes = keyBytes();
    if (!bytes) return Promise.reject(new CredentialsUnavailable());
    cached = { raw, key: crypto.subtle.importKey("raw", bytes as any, "AES-GCM", false, ["encrypt", "decrypt"]) };
  }
  return cached.key;
}

export async function encryptSecret(plain: string, context: string): Promise<string> {
  const ivRandom = crypto.getRandomValues(new Uint8Array(12));
  const iv = new Uint8Array(ivRandom);
  // @ts-ignore Bun/Node type incompatibility with crypto.subtle
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
      { name: "AES-GCM", iv: fromBase64(iv, "base64url") as any, additionalData: encoder.encode(context) },
      k,
      fromBase64(data, "base64url") as any,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new DecryptError();
  }
}
