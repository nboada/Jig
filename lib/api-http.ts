import type { Body } from "./api";
import type { Db } from "./db";
import { verifyAccessToken } from "./oauth";
import { SnippetError } from "./snippets";

const STATUS = { invalid: 400, not_found: 404, conflict: 409 } as const;

function reply(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

const failure = (code: string, message: string, status: number, headers?: Record<string, string>) =>
  reply({ error: { code, message } }, status, headers);

export async function authorize(db: Db, req: Request): Promise<{ source: string } | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const grant = await verifyAccessToken(db, bearer);
  return grant?.scope === "app" ? { source: `app:${grant.name}` } : null;
}

async function readBody(req: Request): Promise<Body> {
  const value = await req.json().catch(() => undefined);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SnippetError("The body must be a JSON object.", "invalid");
  }
  return value as Body;
}

export async function respond(
  db: Db,
  req: Request,
  fn: (ctx: { source: string; body: () => Promise<Body> }) => Promise<unknown>,
  status = 200,
): Promise<Response> {
  const auth = await authorize(db, req);
  if (!auth) {
    return failure("unauthorized", "Sign in to Jig again.", 401, { "WWW-Authenticate": 'Bearer error="invalid_token"' });
  }
  try {
    return reply(await fn({ source: auth.source, body: () => readBody(req) }), status);
  } catch (error) {
    if (error instanceof SnippetError) return failure(error.code, error.message, STATUS[error.code]);
    console.error("API request failed:", error);
    return failure("server_error", "Something went wrong. Try again.", 500);
  }
}
