import type { Metadata } from "next";
import { headers } from "next/headers";
import { deleteToken } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getDb } from "@/lib/db";
import { formatDate, timeAgo } from "@/lib/format";
import { listTokens } from "@/lib/tokens";
import { ConnectPanel } from "./ConnectPanel";

export const metadata: Metadata = { title: "Connect" };

export default async function ConnectPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const endpoint = `${proto}://${host}/api/mcp`;
  const tokens = await listTokens(await getDb());

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect an agent</h1>
        <p className="mt-2 text-muted">
          Snippeta is an MCP server. Any agent that speaks MCP over HTTP (Claude Code, Codex, Kimi, Cursor) can search,
          fetch, save and roll back snippets once it has a token.
        </p>
        <p className="mt-4 rounded-md border border-line bg-panel px-3 py-2 font-mono text-sm break-all">{endpoint}</p>
      </div>

      <ConnectPanel endpoint={endpoint} />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Tokens</h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">No tokens yet. Create one above for each agent or machine.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted">
                    <span className="font-mono">{t.prefix}...</span> created {formatDate(t.createdAt)},{" "}
                    {t.lastUsedAt ? `last used ${timeAgo(t.lastUsedAt)}` : "never used"}
                  </p>
                </div>
                <form action={deleteToken}>
                  <input type="hidden" name="id" value={t.id} />
                  <ConfirmButton
                    message={`Revoke "${t.name}"? Agents using it lose access straight away.`}
                    className="text-danger hover:underline"
                  >
                    Revoke
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
