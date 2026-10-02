import { connectApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { requireUnlock } from "@/lib/api-locked";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, () => connectApi.tokens(db));
}

export async function POST(req: Request) {
  const db = await getDb();
  return respond(db, req, async ({ body }) => connectApi.createToken(db, await body()), 201, requireUnlock(db, req));
}
