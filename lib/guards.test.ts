import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every export of a "use server" file is a public endpoint, and pages under app/(app) must check
 * the session themselves (layouts don't re-run on client navigation). These read the source, so a
 * new action or page without its guard fails here rather than in production.
 */

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Each exported async function's name and body (up to its closing brace at the start of a line). */
function exportedFunctions(source: string): { name: string; body: string }[] {
  return [...source.matchAll(/^export (?:default )?async function (\w+)/gm)].map((match) => {
    const end = source.indexOf("\n}\n", match.index);
    return { name: match[1], body: source.slice(match.index, end === -1 ? undefined : end) };
  });
}

// The only actions that run before there's a session.
const PUBLIC = ["login", "logout", "passkeyPromptOptions", "loginWithPasskey"];

describe("server actions", () => {
  test("every action in app/actions.ts checks the session first, apart from the public few", () => {
    const actions = exportedFunctions(read("app/actions.ts"));
    expect(actions.length).toBeGreaterThan(30);
    for (const { name, body } of actions) {
      if (PUBLIC.includes(name)) continue;
      // requireAuth must be the first thing awaited.
      const first = body.match(/await ([\w.]+)\(/)?.[1];
      expect({ name, first }).toEqual({ name, first: "requireAuth" });
    }
  });

  test("the public actions are exactly the expected ones", () => {
    const unguarded = exportedFunctions(read("app/actions.ts")).filter((a) => !a.body.includes("requireAuth()"));
    expect(unguarded.map((a) => a.name).sort()).toEqual([...PUBLIC].sort());
  });

  test("app/share-actions.ts exports only the two actions a share link needs", () => {
    const source = read("app/share-actions.ts");
    const exported = [...source.matchAll(/^export (?:async )?(?:function|const|let|class) (\w+)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(["openShare", "unlockShare"]);
  });
});

describe("pages", () => {
  function files(dir: string): string[] {
    return readdirSync(join(root, dir)).flatMap((name) => {
      const path = join(dir, name);
      return statSync(join(root, path)).isDirectory() ? files(path) : [path];
    });
  }

  test("every page and layout under app/(app) checks the session itself", () => {
    const guarded = files("app/(app)").filter((f) => /\/(page|layout)\.tsx$/.test(f));
    expect(guarded.length).toBeGreaterThan(15);
    for (const file of guarded) {
      const main = exportedFunctions(read(file)).find((f) => /^export default/.test(f.body));
      expect({ file, guarded: main?.body.includes("await requireAuth()") }).toEqual({ file, guarded: true });
    }
  });

  test("the proxy never touches the database (it runs before every request)", () => {
    const imports = [...read("proxy.ts").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["./lib/session", "next/server"]);
    // lib/session.ts may only bring in pure helpers.
    const sessionImports = [...read("lib/session.ts").matchAll(/^import (type )?.*from "([^"]+)"/gm)].map((m) => `${m[1] ?? ""}${m[2]}`);
    expect(sessionImports.sort()).toEqual(["./signing", "type ./db"]);
  });
});
