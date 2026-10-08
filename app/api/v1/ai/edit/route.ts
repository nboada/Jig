import { respond } from "@/lib/api-http";
import { aiApi } from "@/lib/api-ai";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = await getDb();
  return respond(db, req, async ({ body }) => aiApi.edit(await body()));
}
