import { json, preflight, protectedResourceMetadata } from "@/lib/oauth-http";

export const GET = (req: Request) => json(protectedResourceMetadata(req));
export const OPTIONS = preflight;
