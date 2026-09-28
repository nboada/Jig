import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { getDb } from "@/lib/db";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp";
import { verifyToken } from "@/lib/tokens";

export const runtime = "nodejs";

const handler = createMcpHandler((server) => registerTools(server, getDb), {
  serverInfo: { name: "snippeta", version: "1.0.0" },
  instructions: SERVER_INSTRUCTIONS,
});

/** Agents authenticate with a token created on the Connect page: `Authorization: Bearer snp_...`. */
const authed = withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!bearer) return undefined;
    const token = await verifyToken(await getDb(), bearer);
    return token ? { token: bearer!, clientId: token.name, scopes: [] } : undefined;
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };
