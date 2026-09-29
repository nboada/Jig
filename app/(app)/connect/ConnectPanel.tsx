"use client";

import { useActionState } from "react";
import { newToken } from "@/app/actions";
import { CopyButton } from "@/components/CopyButton";

function Config({ title, hint, code }: { title: string; hint: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed">{code}</pre>
    </div>
  );
}

export function ConnectPanel({ endpoint }: { endpoint: string }) {
  const [state, action, pending] = useActionState(newToken, {});
  const token = state.token ?? "YOUR_TOKEN";

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">1. Create a token</h2>
        <form action={action} className="flex flex-col gap-3 sm:flex-row">
          <input
            name="name"
            required
            placeholder="Name it after the agent, e.g. Claude Code on MacBook"
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent"
          />
          <button
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Creating" : "Create token"}
          </button>
        </form>
        {state.token && (
          <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/10 p-4">
            <p className="text-sm">Copy this token now. It is only shown once, the commands below already include it.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-ink px-3 py-2 font-mono text-sm">{state.token}</code>
              <CopyButton value={state.token} />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">2. Add Jig to your agent</h2>
        <Config
          title="Claude Code"
          hint="Run once in your terminal. --scope user makes it available in every project."
          code={`claude mcp add --transport http --scope user jig ${endpoint} \\\n  --header "Authorization: Bearer ${token}"`}
        />
        <Config
          title="Codex"
          hint="Add to ~/.codex/config.toml, then export JIG_TOKEN in your shell profile."
          code={`[mcp_servers.jig]\nurl = "${endpoint}"\nbearer_token_env_var = "JIG_TOKEN"\n\n# ~/.zshrc\nexport JIG_TOKEN="${token}"`}
        />
        <Config
          title="Kimi Code CLI"
          hint="Run once in your terminal. Saved to ~/.kimi/mcp.json."
          code={`kimi mcp add --transport http jig ${endpoint} \\\n  --header "Authorization: Bearer ${token}"`}
        />
        <Config
          title="Cursor and other JSON configs"
          hint="Add to the client's MCP config file, e.g. ~/.cursor/mcp.json."
          code={JSON.stringify(
            { mcpServers: { jig: { url: endpoint, headers: { Authorization: `Bearer ${token}` } } } },
            null,
            2,
          )}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">3. Ask for snippets</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-text/80">
          <li>Add the GSAP snippet from Jig to this project.</li>
          <li>Set up Lenis using my config from Jig.</li>
          <li>Save this hook to Jig as a new snippet, tagged react.</li>
          <li>The Lenis snippet broke. Show me what changed in Jig and roll it back.</li>
        </ul>
      </section>
    </>
  );
}
