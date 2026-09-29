import { getPublicOrigin } from "mcp-handler";
import { OAuthError, SCOPE } from "./oauth";

/**
 * The HTTP side of OAuth: this site's public address, the discovery documents, and JSON replies
 * with the CORS and no-store headers the specs ask for.
 */

/** This site's public origin: JIG_ORIGIN when set, else from the request (and its proxy headers). */
export function publicOrigin(req: Request): string {
  const configured = process.env.JIG_ORIGIN?.replace(/\/+$/, "");
  return configured || getPublicOrigin(req);
}

/** The MCP endpoint's address, which is what tokens are for (the OAuth "resource"). */
export const resourceUrl = (req: Request) => `${publicOrigin(req)}/api/mcp`;

/** The same address from a page's or action's request headers. */
export function resourceUrlFrom(h: Headers): string {
  const configured = process.env.JIG_ORIGIN?.replace(/\/+$/, "");
  if (configured) return `${configured}/api/mcp`;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/mcp`;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/** An OAuth error reply; anything unexpected is logged and reported as server_error. */
export function oauthError(error: unknown): Response {
  if (error instanceof OAuthError) return json({ error: error.code, error_description: error.message }, error.status);
  console.error("OAuth request failed:", error);
  return json({ error: "server_error", error_description: "Something went wrong. Try again." }, 500);
}

/** A request body as a plain object, whether it came as a form or as JSON. */
export async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const data = await req.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(data ?? {}).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  const form = await req.formData().catch(() => null);
  const out: Record<string, string> = {};
  form?.forEach((value, key) => {
    if (typeof value === "string") out[key] = value;
  });
  return out;
}

/** RFC 9728: where the MCP endpoint's tokens come from. */
export function protectedResourceMetadata(req: Request) {
  return {
    resource: resourceUrl(req),
    authorization_servers: [publicOrigin(req)],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Jig",
  };
}

/** RFC 8414: how to register, sign in and get tokens. */
export function authorizationServerMetadata(req: Request) {
  const origin = publicOrigin(req);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
  };
}
