import { decryptSecret, encryptionReady, encryptSecret, CredentialsUnavailable } from "./crypto";
import type { Db } from "./db";
import { PLATFORMS, platformById, type Platform, type PlatformId } from "./ai-providers";


const PROVIDER = "ai-provider";
const keyRow = (id: PlatformId) => `ai-key:${id}`;
const modelRow = (id: PlatformId) => `ai-model:${id}`;
const context = (id: PlatformId) => `app-secret:ai-key:${id}`;

export type PlatformStatus = {
  id: PlatformId;
  source: "app" | "env" | null;
  hint: string | null;
  model: string | null;
};

export type AiSettings = {
  active: PlatformId | null;
  platforms: PlatformStatus[];
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

export async function resolveAi(db: Db): Promise<ResolvedAi | null> {
  const values = await rows(db);
  const settings = await getAiSettings(db);
  if (!settings.active) return null;
  const platform = platformById(settings.active)!;
  const saved = savedKey(values, platform.id);
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
