import { respond } from "@/lib/api-http";
import { lockedNotesApi, requireUnlock } from "@/lib/api-locked";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext<"/api/v1/locked/notes/[slug]/lock">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, async ({ body }) => lockedNotesApi.lock(db, slug, await body()), 200, requireUnlock(db, req));
}
