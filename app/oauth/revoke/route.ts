import { getDb } from "@/lib/db";
import { revokeByToken } from "@/lib/oauth";
import { json, oauthError, preflight, readBody } from "@/lib/oauth-http";

export async function POST(req: Request) {
  try {
    const { token } = await readBody(req);
    if (token) await revokeByToken(await getDb(), token);
    return json({});
  } catch (error) {
    return oauthError(error);
  }
}

export const OPTIONS = preflight;
