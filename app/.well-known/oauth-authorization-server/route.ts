import { authorizationServerMetadata, json, preflight } from "@/lib/oauth-http";

// RFC 8414 discovery: Jig is its own authorization server.
export const GET = (req: Request) => json(authorizationServerMetadata(req));
export const OPTIONS = preflight;
