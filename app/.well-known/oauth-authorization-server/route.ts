import { authorizationServerMetadata, json, preflight } from "@/lib/oauth-http";

export const GET = (req: Request) => json(authorizationServerMetadata(req));
export const OPTIONS = preflight;
