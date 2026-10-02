import { respond } from "@/lib/api-http";
import { exchangeUnlockCode } from "@/lib/api-locked";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = await getDb();
  return respond(db, req, async (caller) => exchangeUnlockCode(db, caller, await caller.body()));
}
