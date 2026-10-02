import { notesApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/notes/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => notesApi.get(db, slug, new URL(req.url).searchParams));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/v1/notes/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, async ({ source, body }) => notesApi.update(db, slug, await body(), source));
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/v1/notes/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => notesApi.remove(db, slug));
}
