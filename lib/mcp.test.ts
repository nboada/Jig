import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { pgliteDb, prepare, type Db } from "./db";
import { registerTools } from "./mcp";

type Result = { content: { type: string; text: string }[]; isError?: boolean };
type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<Result>;

let db: Db;
const tools = new Map<string, Handler>();

beforeAll(async () => {
  db = await prepare(await pgliteDb());
  const fake = { registerTool: (name: string, _config: unknown, handler: Handler) => void tools.set(name, handler) };
  registerTools(fake as unknown as McpServer, async () => db);
});

beforeEach(async () => {
  await db.query(`TRUNCATE notes, note_versions`);
});

async function call(name: string, args: Record<string, unknown>) {
  const result = await tools.get(name)!(args, {});
  return { text: result.content[0].text, isError: result.isError ?? false };
}

describe("notes over MCP", () => {
  test("a note round-trips through the tools", async () => {
    expect((await call("create_note", { title: "Deploy checklist", body: "1. Push\n2. Publish\n", tags: ["deploy"] })).text)
      .toContain("deploy-checklist");
    expect(
      (await call("update_note", { slug: "deploy-checklist", body: "1. Push\n2. Check\n3. Publish\n", message: "Add check" })).text,
    ).toContain("version 2");

    const latest = await call("get_note", { slug: "deploy-checklist" });
    expect(latest.text).toContain("3. Publish");
    expect(latest.text).toContain("Version: 2 (latest)");
    expect((await call("get_note", { slug: "deploy-checklist", version: 1 })).text).toContain("Version: 1 of 2 (older version)");

    expect((await call("search_notes", { query: "check" })).text).toContain("deploy-checklist");
    const history = await call("list_note_versions", { slug: "deploy-checklist" });
    expect(history.text).toContain("v2 (latest)");
    expect(history.text).toContain("Add check");
    expect(history.text).toContain("by mcp:agent");

    expect((await call("restore_note_version", { slug: "deploy-checklist", version: 1 })).text).toContain("now version 3");
  });

  test("problems come back as tool errors", async () => {
    const missing = await call("get_note", { slug: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("No note");
    expect((await call("search_notes", {})).text).toContain("There are no notes yet");
  });

  test("locked notes don't exist as far as agents can tell", async () => {
    await call("create_note", { title: "Plugin keys", body: "ACF: abc123" });
    await db.query(`UPDATE notes SET locked_at = now()`);
    expect((await call("search_notes", { query: "plugin" })).text).not.toContain("plugin-keys");
    expect((await call("search_notes", {})).text).not.toContain("plugin-keys");
    for (const [tool, args] of [
      ["get_note", {}],
      ["update_note", { body: "changed" }],
      ["list_note_versions", {}],
      ["restore_note_version", { version: 1 }],
    ] as const) {
      const result = await call(tool, { slug: "plugin-keys", ...args });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("No note");
    }
  });
});

describe("credentials stay out of MCP", () => {
  test("no tool mentions credentials or secrets", () => {
    expect([...tools.keys()].filter((name) => /credential|secret/i.test(name))).toEqual([]);
  });

  const IMPORT_RE = /(?:from|import)\s*\(?\s*["'](?:\.\/|@\/lib\/)([\w.\/-]+)["']/g;

  test("the import regex matches from, bare import, dynamic import and @/lib forms", () => {
    const sample = [
      `import { a } from "./notes";`,
      `import "./init";`,
      `const b = import("./lazy");`,
      `import { c } from "@/lib/crypto";`,
    ].join("\n");
    expect([...sample.matchAll(IMPORT_RE)].map((m) => m[1])).toEqual(["notes", "init", "lazy", "crypto"]);
  });

  function reachable(entry: string): Set<string> {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      for (const match of source.matchAll(IMPORT_RE)) {
        const candidate = `${match[1]}.ts`;
        if (existsSync(join(import.meta.dir, candidate))) stack.push(candidate);
      }
    }
    return seen;
  }

  for (const entry of ["mcp.ts", "api.ts"]) {
    test(`${entry} does not import the credentials, crypto, shares or locked-notes modules, even indirectly`, () => {
      const seen = reachable(entry);
      expect(seen.has("notes.ts")).toBe(true);
      for (const forbidden of ["credentials.ts", "crypto.ts", "shares.ts", "locked-notes.ts"]) {
        expect(seen.has(forbidden)).toBe(false);
      }
    });
  }

  test("api-ai.ts does not import the credentials, shares or locked-notes modules, even indirectly", () => {
    const seen = reachable("api-ai.ts");
    for (const forbidden of ["credentials.ts", "shares.ts", "locked-notes.ts"]) expect(seen.has(forbidden)).toBe(false);
  });
});
