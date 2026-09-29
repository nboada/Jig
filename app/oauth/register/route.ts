import { getDb } from "@/lib/db";
import { registerClient } from "@/lib/oauth";
import { json, oauthError, preflight } from "@/lib/oauth-http";

/** RFC 7591 dynamic registration. Registering alone grants nothing: the owner still approves. */
export async function POST(req: Request) {
  try {
    const client = await registerClient(await getDb(), await req.json().catch(() => null));
    return json(
      {
        client_id: client.id,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      201,
    );
  } catch (error) {
    return oauthError(error);
  }
}

export const OPTIONS = preflight;
