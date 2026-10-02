import { accountApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { requireUnlock } from "@/lib/api-locked";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: RouteContext<"/api/v1/passkeys/[id]">) {
  const [db, { id }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => accountApi.removePasskey(db, id), 200, requireUnlock(db, req));
}
