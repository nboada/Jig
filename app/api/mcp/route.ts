import { originValidationResponse } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { getDb } from "@/lib/db";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp";
import { verifyToken } from "@/lib/tokens";

export const runtime = "nodejs";

const handler = createMcpHandler((server) => registerTools(server, getDb), {
  serverInfo: { name: "jig", version: "1.0.0" },
  instructions: SERVER_INSTRUCTIONS,
});

/** Agents authenticate with a token created on the Connect page: `Authorization: Bearer jig_...`. */
const authed = withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!bearer) return undefined;
    const token = await verifyToken(await getDb(), bearer);
    return token ? { token: bearer!, clientId: token.name, scopes: [] } : undefined;
  },
  { required: true },
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
