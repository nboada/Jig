import { credentialsApi } from "@/lib/api-secure";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, () => credentialsApi.list(db, new URL(req.url).searchParams));
}

export async function POST(req: Request) {
  const db = await getDb();
  return respond(db, req, async ({ body }) => credentialsApi.create(db, await body()), 201);
}
