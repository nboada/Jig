import { connectApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: RouteContext<"/api/v1/tokens/[id]">) {
  const [db, { id }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => connectApi.revokeToken(db, id));
}
