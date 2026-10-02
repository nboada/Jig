import { trashApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: RouteContext<"/api/v1/trash/[id]">) {
  const [db, { id }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => trashApi.purge(db, id));
}
