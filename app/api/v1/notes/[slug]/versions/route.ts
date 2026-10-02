import { notesApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/notes/[slug]/versions">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => notesApi.versions(db, slug));
}
