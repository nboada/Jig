import { credentialsApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/credentials/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => credentialsApi.get(db, slug));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/v1/credentials/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, async ({ body }) => credentialsApi.update(db, slug, await body()));
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/v1/credentials/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => credentialsApi.remove(db, slug));
}
