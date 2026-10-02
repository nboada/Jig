// Lets the owner's own native apps use this site's passkeys. JIG_APPLE_APP_IDS lists "TEAMID.bundle.id" entries, comma separated.
export function GET() {
  const apps = (process.env.JIG_APPLE_APP_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!apps.length) return new Response("Not found", { status: 404 });
  return Response.json({ webcredentials: { apps } }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
