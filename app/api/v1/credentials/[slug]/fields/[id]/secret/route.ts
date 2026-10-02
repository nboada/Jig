import { credentialsApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { requireUnlock } from "@/lib/api-locked";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/credentials/[slug]/fields/[id]/secret">) {
  const [db, { slug, id }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => credentialsApi.reveal(db, slug, id), 200, requireUnlock(db, req));
}
