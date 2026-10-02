import { snippetsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/snippets/[slug]/diff">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => snippetsApi.diff(db, slug, new URL(req.url).searchParams));
}
