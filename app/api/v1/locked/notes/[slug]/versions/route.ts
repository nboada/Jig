import { respond } from "@/lib/api-http";
import { lockedNotesApi, requireUnlock } from "@/lib/api-locked";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/locked/notes/[slug]/versions">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => lockedNotesApi.versions(db, slug), 200, requireUnlock(db, req));
}
