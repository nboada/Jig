import { decryptSecret, encryptionReady, encryptSecret, CredentialsUnavailable } from "./crypto";
import type { Db } from "./db";
import { PLATFORMS, platformById, type Platform, type PlatformId } from "./ai-providers";

/**
 * The AI keys and choices made in the dashboard, kept in `app_secrets`:
 * - `ai-provider`: the platform Jig uses.
 * - `ai-key:<id>`: `{ enc, hint }`, the key encrypted with the credentials key and bound to its
 *   row, plus its last four characters so the dialog can say which key is saved.
 * - `ai-model:<id>`: a model to use instead of the platform's default.
 * A key saved here wins over the platform's environment variable, which still works on its own.
 * Keys never leave the server: the dialog only ever sees the hint.
 */

const PROVIDER = "ai-provider";
const keyRow = (id: PlatformId) => `ai-key:${id}`;
const modelRow = (id: PlatformId) => `ai-model:${id}`;
const context = (id: PlatformId) => `app-secret:ai-key:${id}`;

export type PlatformStatus = {
  id: PlatformId;
  /** Where its key comes from: saved in Jig, an environment variable, or nowhere yet. */
  source: "app" | "env" | null;
  /** The saved key's last four characters. */
  hint: string | null;
  /** The model set for it, if any (else the platform's default). */
  model: string | null;
};

export type AiSettings = {
  /** The platform in use, or null when none has a key. */
  active: PlatformId | null;
  platforms: PlatformStatus[];
  /** Saving keys needs JIG_ENCRYPTION_KEY, like Credentials. */
  encryptionReady: boolean;
};

export type ResolvedAi = { platform: Platform; apiKey: string; model: string | null };

async function rows(db: Db): Promise<Map<string, string>> {
  const found = await db.query<{ name: string; value: string }>(`SELECT name, value FROM app_secrets WHERE name LIKE 'ai-%'`);
  return new Map(found.map((r) => [r.name, r.value]));
}

function savedKey(values: Map<string, string>, id: PlatformId): { enc: string; hint: string } | null {
  const raw = values.get(keyRow(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const envKey = (platform: Platform) => process.env[platform.envKey]?.trim() || null;

/** The platform to use: the saved choice, else JIG_AI_PROVIDER, else the first with a key. */
function chooseActive(values: Map<string, string>, statuses: PlatformStatus[]): PlatformId | null {
  const usable = (id: string | undefined) => statuses.find((s) => s.id === id && s.source)?.id ?? null;
  return usable(values.get(PROVIDER)) ?? usable(process.env.JIG_AI_PROVIDER) ?? statuses.find((s) => s.source)?.id ?? null;
}

export async function getAiSettings(db: Db): Promise<AiSettings> {
  const values = await rows(db);
  const platforms = PLATFORMS.map((platform): PlatformStatus => {
    const saved = savedKey(values, platform.id);
    return {
      id: platform.id,
      source: saved ? "app" : envKey(platform) ? "env" : null,
      hint: saved?.hint ?? null,
      model: values.get(modelRow(platform.id)) ?? null,
    };
  });
  return { active: chooseActive(values, platforms), platforms, encryptionReady: encryptionReady() };
}

/** The platform, key and model an AI request should use, or null when no key is set anywhere. */
export async function resolveAi(db: Db): Promise<ResolvedAi | null> {
  const values = await rows(db);
  const settings = await getAiSettings(db);
  if (!settings.active) return null;
  const platform = platformById(settings.active)!;
  const saved = savedKey(values, platform.id);
  // A key that can't be decrypted (the encryption key changed) falls back to the environment's.
  const fromApp = saved && encryptionReady() ? await decryptSecret(saved.enc, context(platform.id)).catch(() => null) : null;
  const apiKey = fromApp ?? envKey(platform);
  if (!apiKey) return null;
  return { platform, apiKey, model: values.get(modelRow(platform.id)) ?? null };
}

export async function saveAiKey(db: Db, id: PlatformId, apiKey: string): Promise<void> {
  if (!encryptionReady()) throw new CredentialsUnavailable();
  const value = JSON.stringify({ enc: await encryptSecret(apiKey, context(id)), hint: apiKey.slice(-4) });
  await db.query(
    `INSERT INTO app_secrets (name, value) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [keyRow(id), value],
  );
}

export async function removeAiKey(db: Db, id: PlatformId): Promise<void> {
  await db.query(`DELETE FROM app_secrets WHERE name = $1`, [keyRow(id)]);
}

/** Sets the model for a platform; an empty one goes back to the default. */
export async function setAiModel(db: Db, id: PlatformId, model: string): Promise<void> {
  if (!model.trim()) {
    await db.query(`DELETE FROM app_secrets WHERE name = $1`, [modelRow(id)]);
    return;
  }
  await db.query(
    `INSERT INTO app_secrets (name, value) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [modelRow(id), model.trim()],
  );
}

export async function setActivePlatform(db: Db, id: PlatformId): Promise<void> {
  await db.query(
    `INSERT INTO app_secrets (name, value) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [PROVIDER, id],
  );
}
