import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { CredentialsUnavailable } from "./crypto";
import { pgliteDb, prepare, type Db } from "./db";
import { getAiSettings, removeAiKey, resolveAi, saveAiKey, setActivePlatform, setAiModel } from "./ai-settings";

let db: Db;
const ENV = ["JIG_ENCRYPTION_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "JIG_AI_PROVIDER"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  for (const k of ENV) delete process.env[k];
  process.env.JIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  await db.query(`DELETE FROM app_secrets WHERE name LIKE 'ai-%'`);
});

afterEach(() => {
  for (const k of ENV) delete process.env[k];
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
});

describe("AI settings", () => {
  test("nothing is set up until a key exists somewhere", async () => {
    expect(await resolveAi(db)).toBeNull();
    const settings = await getAiSettings(db);
    expect(settings.active).toBeNull();
    expect(settings.platforms.every((p) => p.source === null)).toBe(true);
  });

  test("a saved key is encrypted, shown only by its last four characters, and used", async () => {
    await saveAiKey(db, "openai", "sk-test-1234567890abcd");
    const [row] = await db.query<{ value: string }>(`SELECT value FROM app_secrets WHERE name = 'ai-key:openai'`);
    expect(row.value).not.toContain("sk-test-1234567890");

    const settings = await getAiSettings(db);
    const openai = settings.platforms.find((p) => p.id === "openai")!;
    expect([openai.source, openai.hint, settings.active]).toEqual(["app", "abcd", "openai"]);

    const ai = await resolveAi(db);
    expect([ai?.platform.id, ai?.apiKey]).toEqual(["openai", "sk-test-1234567890abcd"]);
  });

  test("a key saved in the app wins over the environment; removing it falls back to the environment", async () => {
    process.env.GEMINI_API_KEY = "env-gemini-key";
    expect((await resolveAi(db))?.apiKey).toBe("env-gemini-key");
    expect((await getAiSettings(db)).platforms.find((p) => p.id === "gemini")?.source).toBe("env");

    await saveAiKey(db, "gemini", "app-gemini-key");
    expect((await resolveAi(db))?.apiKey).toBe("app-gemini-key");

    await removeAiKey(db, "gemini");
    expect((await resolveAi(db))?.apiKey).toBe("env-gemini-key");
  });

  test("the chosen platform and its model are remembered", async () => {
    await saveAiKey(db, "gemini", "gemini-key");
    await saveAiKey(db, "anthropic", "anthropic-key");
    await setActivePlatform(db, "anthropic");
    await setAiModel(db, "anthropic", "claude-haiku-4-5");
    const ai = await resolveAi(db);
    expect([ai?.platform.id, ai?.model]).toEqual(["anthropic", "claude-haiku-4-5"]);

    await setAiModel(db, "anthropic", " ");
    expect((await resolveAi(db))?.model).toBeNull();
  });

  test("a chosen platform without a key falls back to one that has a key", async () => {
    await saveAiKey(db, "groq", "groq-key");
    await setActivePlatform(db, "mistral");
    expect((await resolveAi(db))?.platform.id).toBe("groq");
  });

  test("JIG_AI_PROVIDER picks between environment keys when nothing is chosen in the app", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.OPENROUTER_API_KEY = "o";
    expect((await resolveAi(db))?.platform.id).toBe("gemini");
    process.env.JIG_AI_PROVIDER = "openrouter";
    expect((await resolveAi(db))?.platform.id).toBe("openrouter");
  });

  test("saving a key needs the encryption key", async () => {
    delete process.env.JIG_ENCRYPTION_KEY;
    await expect(saveAiKey(db, "openai", "sk-x")).rejects.toBeInstanceOf(CredentialsUnavailable);
    expect((await getAiSettings(db)).encryptionReady).toBe(false);
  });
});
