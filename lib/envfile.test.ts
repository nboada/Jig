import { describe, expect, test } from "bun:test";
import { withEncryptionKey } from "./envfile";

const KEY = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";

describe("withEncryptionKey", () => {
  test("fills an empty key line and keeps the rest of the file", () => {
    const current = "ADMIN_PASSWORD=x\nSNIPPETA_ENCRYPTION_KEY=\nSNIPPETA_TIMEZONE=Australia/Sydney\n";
    expect(withEncryptionKey(current, KEY)).toBe(
      `ADMIN_PASSWORD=x\nSNIPPETA_ENCRYPTION_KEY=${KEY}\nSNIPPETA_TIMEZONE=Australia/Sydney\n`,
    );
  });

  test("appends the key when the file has no key line", () => {
    const result = withEncryptionKey("ADMIN_PASSWORD=x", KEY);
    expect(result).toStartWith("ADMIN_PASSWORD=x\n\n# Encrypts saved credentials.");
    expect(result).toEndWith(`SNIPPETA_ENCRYPTION_KEY=${KEY}\n`);
    expect(withEncryptionKey("", KEY)).toStartWith("# Encrypts");
  });

  test("never overwrites a key that is already set", () => {
    expect(withEncryptionKey(`SNIPPETA_ENCRYPTION_KEY=${KEY}\n`, "other")).toBeNull();
    expect(withEncryptionKey("SNIPPETA_ENCRYPTION_KEY= typo\n", "other")).toBeNull();
  });

  test("ignores commented-out and similarly named lines", () => {
    const current = "# SNIPPETA_ENCRYPTION_KEY=old\nMY_SNIPPETA_ENCRYPTION_KEY=x\n";
    expect(withEncryptionKey(current, KEY)).toEndWith(`SNIPPETA_ENCRYPTION_KEY=${KEY}\n`);
  });
});
