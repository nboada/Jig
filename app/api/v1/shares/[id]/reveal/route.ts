import { sharesApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { UNLOCK_HEADER, unlockValid } from "@/lib/api-locked";
import { getDb } from "@/lib/db";
import { publicOrigin } from "@/lib/oauth-http";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext<"/api/v1/shares/[id]/reveal">) {
  const [db, { id }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, async (caller) => sharesApi.reveal(db, id, publicOrigin(req), await unlockValid(db, caller, req.headers.get(UNLOCK_HEADER))));
}
