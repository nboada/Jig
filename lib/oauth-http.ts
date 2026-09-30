import { getPublicOrigin } from "mcp-handler";
import { OAuthError, SCOPE } from "./oauth";


export function publicOrigin(req: Request): string {
  const configured = process.env.JIG_ORIGIN?.replace(/\/+$/, "");
  return configured || getPublicOrigin(req);
}

export const resourceUrl = (req: Request) => `${publicOrigin(req)}/api/mcp`;

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

export function oauthError(error: unknown): Response {
  if (error instanceof OAuthError) return json({ error: error.code, error_description: error.message }, error.status);
  console.error("OAuth request failed:", error);
  return json({ error: "server_error", error_description: "Something went wrong. Try again." }, 500);
}

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

export function protectedResourceMetadata(req: Request) {
  return {
    resource: resourceUrl(req),
    authorization_servers: [publicOrigin(req)],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Jig",
  };
}

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
