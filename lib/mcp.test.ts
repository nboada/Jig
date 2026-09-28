import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
});

describe("credentials stay out of MCP", () => {
  test("no tool mentions credentials or secrets", () => {
    expect([...tools.keys()].filter((name) => /credential|secret/i.test(name))).toEqual([]);
  });

  test("mcp.ts does not import the credentials or crypto modules, even indirectly", () => {
    const seen = new Set<string>();
    const stack = ["mcp.ts"];
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      for (const match of source.matchAll(/from\s+["']\.\/([\w.-]+)["']/g)) stack.push(`${match[1]}.ts`);
    }
    expect(seen.has("notes.ts")).toBe(true);
    expect(seen.has("credentials.ts")).toBe(false);
    expect(seen.has("crypto.ts")).toBe(false);
  });
});
