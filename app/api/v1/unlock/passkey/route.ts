import { respond } from "@/lib/api-http";
import { passkeyUnlockOptions, unlockWithPasskey } from "@/lib/api-locked";
import { getDb } from "@/lib/db";
import { siteFrom } from "@/lib/passkeys";
import { clientIpFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";

const site = (req: Request) => siteFrom(req.headers.get("x-forwarded-host") ?? req.headers.get("host"), req.headers.get("x-forwarded-proto"));

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, async (caller) => passkeyUnlockOptions(db, caller, site(req)));
}

export async function POST(req: Request) {
  const db = await getDb();
  const ip = clientIpFrom(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
  return respond(db, req, async (caller) => unlockWithPasskey(db, caller, site(req), await caller.body(), ip));
}
