import { settingsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, () => settingsApi.get(db));
}

export async function PATCH(req: Request) {
  const db = await getDb();
  return respond(db, req, async ({ body }) => settingsApi.update(db, await body()));
}
