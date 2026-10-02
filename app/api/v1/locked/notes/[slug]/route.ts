import { respond } from "@/lib/api-http";
import { lockedNotesApi, requireUnlock } from "@/lib/api-locked";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/locked/notes/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => lockedNotesApi.get(db, slug, new URL(req.url).searchParams), 200, requireUnlock(db, req));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/v1/locked/notes/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, async ({ source, body }) => lockedNotesApi.update(db, slug, await body(), source), 200, requireUnlock(db, req));
}
