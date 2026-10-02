import { connectApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { requireUnlock } from "@/lib/api-locked";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: RouteContext<"/api/v1/apps/[id]">) {
  const [db, { id }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, (caller) => connectApi.disconnect(db, caller, id), 200, requireUnlock(db, req));
}
