import { respond } from "@/lib/api-http";
import { aiApi } from "@/lib/api-ai";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, () => aiApi.status(db));
}
