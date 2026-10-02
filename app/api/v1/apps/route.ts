import { connectApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, (caller) => connectApi.apps(db, caller));
}
