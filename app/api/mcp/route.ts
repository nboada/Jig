import { originValidationResponse } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { getDb } from "@/lib/db";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp";
import { SCOPE, verifyAccessToken } from "@/lib/oauth";
import { verifyToken } from "@/lib/tokens";

export const runtime = "nodejs";

const handler = createMcpHandler((server) => registerTools(server, getDb), {
  serverInfo: { name: "jig", version: "1.0.0" },
  instructions: SERVER_INSTRUCTIONS,
});

/**
 * Agents authenticate with a token created on the Connect page (`Authorization: Bearer jig_...`),
 * or with an access token from signing in over OAuth (apps like Claude; see lib/oauth.ts). Either
 * way the token's name becomes the saved versions' source. Without one, the 401 points the app at
 * the OAuth discovery document.
 */
const authed = withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!bearer) return undefined;
    const db = await getDb();
    const token = await verifyToken(db, bearer);
    if (token) return { token: bearer, clientId: token.name, scopes: [] };
    const app = await verifyAccessToken(db, bearer);
    return app ? { token: bearer, clientId: app.name, scopes: [SCOPE], expiresAt: app.expiresAt } : undefined;
  },
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp", resourceUrl: process.env.JIG_ORIGIN?.replace(/\/+$/, "") || undefined },
);

/**
 * The MCP spec requires refusing requests from another site's page (DNS rebinding). Agents send no
 * Origin at all and pass; a browser page may only call from this site.
 */
async function guarded(req: Request) {
  const own = [new URL(req.url).hostname, (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0]];
  return originValidationResponse(req, own.filter(Boolean)) ?? authed(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
