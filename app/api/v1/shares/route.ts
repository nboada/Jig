import { sharesApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { UNLOCK_HEADER, unlockValid } from "@/lib/api-locked";
import { getDb } from "@/lib/db";
import { publicOrigin } from "@/lib/oauth-http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, () => sharesApi.list(db, new URL(req.url).searchParams));
}

export async function POST(req: Request) {
  const db = await getDb();
  return respond(db, req, async (caller) => {
    const unlocked = await unlockValid(db, caller, req.headers.get(UNLOCK_HEADER));
    return sharesApi.create(db, await caller.body(), publicOrigin(req), unlocked);
  }, 201);
}
