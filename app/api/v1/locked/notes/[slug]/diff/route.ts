import { respond } from "@/lib/api-http";
import { lockedNotesApi, requireUnlock } from "@/lib/api-locked";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/locked/notes/[slug]/diff">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => lockedNotesApi.diff(db, slug, new URL(req.url).searchParams), 200, requireUnlock(db, req));
}
