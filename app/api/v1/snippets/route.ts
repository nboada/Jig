import { snippetsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, () => snippetsApi.list(db, new URL(req.url).searchParams));
}

export async function POST(req: Request) {
  const db = await getDb();
  return respond(db, req, async ({ source, body }) => snippetsApi.create(db, await body(), source), 201);
}
