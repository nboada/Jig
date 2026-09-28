import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { CredentialsUnavailable, DecryptError, decryptSecret, encryptionReady, encryptSecret } from "./crypto";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const saved = process.env.SNIPPETA_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SNIPPETA_ENCRYPTION_KEY = KEY_A;
});

afterAll(() => {
  if (saved === undefined) delete process.env.SNIPPETA_ENCRYPTION_KEY;
  else process.env.SNIPPETA_ENCRYPTION_KEY = saved;
});

describe("crypto", () => {
  test("round-trips a value and uses a fresh IV each time", async () => {
    const a = await encryptSecret("hunter2", "cred:field");
    const b = await encryptSecret("hunter2", "cred:field");
    expect(a).toMatch(/^v1:[\w-]+:[\w-]+$/);
    expect(a).not.toBe(b);
    expect(await decryptSecret(a, "cred:field")).toBe("hunter2");
    expect(await decryptSecret(b, "cred:field")).toBe("hunter2");
  });

  test("keeps non-ASCII and long values intact", async () => {
    const value = "pässwörd 🔑 " + "x".repeat(10_000);
    expect(await decryptSecret(await encryptSecret(value, "c:f"), "c:f")).toBe(value);
  });

  test("tampered ciphertext fails", async () => {
    const [prefix, iv, data] = (await encryptSecret("hunter2", "c:f")).split(":");
    const flipped = `${prefix}:${iv}:${data[0] === "A" ? "B" : "A"}${data.slice(1)}`;
    await expect(decryptSecret(flipped, "c:f")).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptSecret("garbage", "c:f")).rejects.toBeInstanceOf(DecryptError);
  });

  test("a value moved to another credential or field fails", async () => {
    const stored = await encryptSecret("hunter2", "cred-1:field-1");
    await expect(decryptSecret(stored, "cred-1:field-2")).rejects.toThrow("Can't decrypt");
    await expect(decryptSecret(stored, "cred-2:field-1")).rejects.toThrow("Can't decrypt");
  });

  test("the wrong key fails", async () => {
    const stored = await encryptSecret("hunter2", "c:f");
    process.env.SNIPPETA_ENCRYPTION_KEY = KEY_B;
    await expect(decryptSecret(stored, "c:f")).rejects.toThrow("Can't decrypt");
  });

  test("a missing or short key is reported", async () => {
    delete process.env.SNIPPETA_ENCRYPTION_KEY;
    expect(encryptionReady()).toBe(false);
    await expect(encryptSecret("x", "c:f")).rejects.toBeInstanceOf(CredentialsUnavailable);
    process.env.SNIPPETA_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(encryptionReady()).toBe(false);
    process.env.SNIPPETA_ENCRYPTION_KEY = KEY_A;
    expect(encryptionReady()).toBe(true);
  });

  test("a malformed key with an invalid character is reported as not ready", () => {
    // Same length as a real 32-byte key (44 chars), but with an invalid character substituted in.
    const malformed = "!" + KEY_A.slice(1);
    expect(malformed).toHaveLength(44);
    process.env.SNIPPETA_ENCRYPTION_KEY = malformed;
    expect(encryptionReady()).toBe(false);
  });
});
