import { snippetsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext<"/api/v1/snippets/[slug]/restore">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, async ({ source, body }) => snippetsApi.restore(db, slug, await body(), source));
}
