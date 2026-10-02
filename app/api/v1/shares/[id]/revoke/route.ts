import { sharesApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext<"/api/v1/shares/[id]/revoke">) {
  const [db, { id }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => sharesApi.revoke(db, id));
}
