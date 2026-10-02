import { respond } from "@/lib/api-http";
import { unlockWithPassword } from "@/lib/api-locked";
import { getDb } from "@/lib/db";
import { clientIpFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = await getDb();
  const ip = clientIpFrom(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
  return respond(db, req, async (caller) => unlockWithPassword(db, caller, await caller.body(), ip));
}
