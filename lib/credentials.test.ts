import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  createCredential,
  getCredential,
  listCredentials,
  revealField,
  updateCredential,
} from "./credentials";
import { CredentialsUnavailable } from "./crypto";
import { pgliteDb, prepare, type Db } from "./db";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 8).toString("base64");
const saved = process.env.SNIPPETA_ENCRYPTION_KEY;
let db: Db;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  process.env.SNIPPETA_ENCRYPTION_KEY = KEY;
  await db.query(`TRUNCATE credentials`);
});

afterAll(() => {
  if (saved === undefined) delete process.env.SNIPPETA_ENCRYPTION_KEY;
  else process.env.SNIPPETA_ENCRYPTION_KEY = saved;
});

const shopify = {
  title: "Acme Shopify",
  url: "https://acme.myshopify.com/admin",
  tags: ["acme"],
  note: "Custom app: Snippeta sync",
  fields: [
    { label: "Store", secret: false, value: "store-01.example" },
    { label: "API key", secret: true, value: "shpat_live_123" },
  ],
};
const slug = "acme-shopify";

describe("credentials", () => {
  test("secrets are stored encrypted and never returned by getCredential", async () => {
    const c = await createCredential(db, shopify);
    expect(c.slug).toBe(slug);
    expect(c.fields.map((f) => [f.label, f.secret, f.value])).toEqual([
      ["Store", false, "store-01.example"],
      ["API key", true, null],
    ]);

    const [row] = await db.query(`SELECT fields FROM credentials`);
    expect(JSON.stringify(row.fields)).not.toContain("shpat_live_123");
    expect((row.fields as { value: string }[])[1].value.startsWith("v1:")).toBe(true);

    expect(await revealField(db, slug, c.fields[1].id)).toBe("shpat_live_123");
    expect(await revealField(db, slug, c.fields[0].id)).toBe("store-01.example");
  });

  test("an empty secret keeps the stored value, reordering keeps it decryptable, a new value replaces it", async () => {
    const [store, key] = (await createCredential(db, shopify)).fields;
    await updateCredential(db, slug, {
      ...shopify,
      fields: [
        { id: key.id, label: "API key", secret: true, value: "" },
        { id: store.id, label: "Store", secret: false, value: "store-01.example" },
      ],
    });
    expect(await revealField(db, slug, key.id)).toBe("shpat_live_123");
    expect((await getCredential(db, slug))?.fields.map((f) => f.label)).toEqual(["API key", "Store"]);

    await updateCredential(db, slug, {
      ...shopify,
      fields: [{ id: key.id, label: "API key", secret: true, value: "shpat_live_456" }],
    });
    expect(await revealField(db, slug, key.id)).toBe("shpat_live_456");
  });

  test("a new secret needs a value, and making a secret plain needs a new value", async () => {
    const [store, key] = (await createCredential(db, shopify)).fields;
    await expect(
      updateCredential(db, slug, {
        ...shopify,
        fields: [{ id: store.id, label: "Store", secret: false, value: "x" }, { label: "Secret", secret: true, value: "" }],
      }),
    ).rejects.toThrow('Enter a value for "Secret"');
    await expect(
      updateCredential(db, slug, { ...shopify, fields: [{ id: key.id, label: "API key", secret: false, value: "" }] }),
    ).rejects.toThrow("no longer secret");
  });

  test("a removed field can no longer be revealed", async () => {
    const [store, key] = (await createCredential(db, shopify)).fields;
    await updateCredential(db, slug, { ...shopify, fields: [{ id: store.id, label: "Store", secret: false, value: "x" }] });
    await expect(revealField(db, slug, key.id)).rejects.toThrow("no field");
  });

  test("search covers titles, labels and plain values, never secrets", async () => {
    await createCredential(db, shopify);
    await createCredential(db, { title: "Hosting", fields: [{ label: "Password", secret: true, value: "acme-secret" }] });

    expect((await listCredentials(db, { query: "acme" })).map((c) => c.slug)).toEqual([slug]);
    expect((await listCredentials(db, { query: "store-01" })).map((c) => c.slug)).toEqual([slug]);
    expect((await listCredentials(db, { query: "password" })).map((c) => c.slug)).toEqual(["hosting"]);
    expect(await listCredentials(db, { query: "secret" })).toEqual([]);

    const [summary] = await listCredentials(db, { tag: "acme" });
    expect(summary.labels).toEqual(["Store", "API key"]);
    expect(JSON.stringify(summary)).not.toContain("store-01");
  });

  test("ciphertext copied to another field does not decrypt", async () => {
    const c = await createCredential(db, {
      title: "Two secrets",
      fields: [
        { label: "A", secret: true, value: "first" },
        { label: "B", secret: true, value: "second" },
      ],
    });
    await db.query(`UPDATE credentials SET fields = jsonb_set(fields, '{1,value}', fields->0->'value')`);
    await expect(revealField(db, "two-secrets", c.fields[1].id)).rejects.toThrow("Can't decrypt");
  });

  test("a changed key gives a decrypt error, a missing key blocks everything but the list", async () => {
    const c = await createCredential(db, shopify);
    process.env.SNIPPETA_ENCRYPTION_KEY = OTHER_KEY;
    await expect(revealField(db, slug, c.fields[1].id)).rejects.toThrow("Can't decrypt");

    delete process.env.SNIPPETA_ENCRYPTION_KEY;
    await expect(getCredential(db, slug)).rejects.toBeInstanceOf(CredentialsUnavailable);
    await expect(createCredential(db, shopify)).rejects.toBeInstanceOf(CredentialsUnavailable);
    expect((await listCredentials(db)).length).toBe(1);
  });
});
