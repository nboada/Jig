import { getDb } from "@/lib/db";
import { exchangeCode, OAuthError, refreshTokens } from "@/lib/oauth";
import { json, oauthError, preflight, readBody } from "@/lib/oauth-http";

/** Trades a code, or a refresh token, for tokens. Public clients only, so there's no secret. */
export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const db = await getDb();
    if (body.grant_type === "authorization_code") {
      return json(
        await exchangeCode(db, {
          code: body.code,
          clientId: body.client_id,
          redirectUri: body.redirect_uri,
          codeVerifier: body.code_verifier,
          resource: body.resource,
        }),
      );
    }
    if (body.grant_type === "refresh_token") {
      return json(await refreshTokens(db, { refreshToken: body.refresh_token, clientId: body.client_id }));
    }
    throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  } catch (error) {
    return oauthError(error);
  }
}

export const OPTIONS = preflight;
