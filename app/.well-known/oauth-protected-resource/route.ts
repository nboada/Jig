import { json, preflight, protectedResourceMetadata } from "@/lib/oauth-http";

// RFC 9728 discovery for the MCP endpoint. Also served at /api/mcp under this path (the spec's
// path-inserted form), which is where the MCP endpoint's 401 points.
export const GET = (req: Request) => json(protectedResourceMetadata(req));
export const OPTIONS = preflight;
