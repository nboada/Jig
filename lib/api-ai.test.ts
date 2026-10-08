import { beforeAll, describe, expect, mock, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { createNote } from "./notes";
import { SnippetError } from "./snippets";

class AiError extends Error {}
const sent: string[] = [];
mock.module("./ai", () => ({
  AiError,
  rewrite: async (mode: string, text: string) => {
    sent.push(text);
    if (text === "busy") throw new AiError("Gemini is busy right now. Try again in a moment.");
    return `${mode}: ${text}`;
  },
  review: async () => ({ summary: "Looks fine.", issues: [] }),
  fixFile: async (file: { content: string }) => `${file.content}// fixed\n`,
}));

const { aiApi } = await import("./api-ai");
const { ApiFailure } = await import("./api-http");

let db: Db;
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) => (e instanceof SnippetError ? e.code : e instanceof ApiFailure ? e.code : "server"),
  );

beforeAll(async () => {
  db = await prepare(await pgliteDb());
  await createNote(db, { title: "Open", tags: [], body: "hello" });
  await createNote(db, { title: "Secret", tags: [], body: "hidden" });
  await db.query(`UPDATE notes SET locked_at = now() WHERE slug = 'secret'`);
});

describe("app AI", () => {
  test("rewrites text, and refuses a locked note before anything is sent", async () => {
    expect(await aiApi.rewrite(db, { mode: "shorten", text: "hello", slug: "open" })).toEqual({ text: "shorten: hello" });
    sent.length = 0;
    expect(await code(aiApi.rewrite(db, { mode: "fix", text: "hidden", slug: "secret" }))).toBe("invalid");
    expect(sent).toEqual([]);
  });

  test("checks its input like the dashboard", async () => {
    expect(await code(aiApi.rewrite(db, { mode: "translate", text: "hi" }))).toBe("invalid");
    expect(await code(aiApi.rewrite(db, { mode: "fix", text: "   " }))).toBe("invalid");
    expect(await code(aiApi.review({ title: "x", language: "js", instructions: "", files: [{ name: "a.js", content: " " }] }))).toBe("invalid");
    expect(await code(aiApi.fix({ file: { name: "a.js", content: "x" }, language: "js", issues: [] }))).toBe("invalid");
  });

  test("reviews and fixes a file", async () => {
    expect(await aiApi.review({ title: "x", language: "js", instructions: "", files: [{ name: "a.js", content: "let a" }] })).toEqual({
      summary: "Looks fine.",
      issues: [],
    });
    const issue = { file: "a.js", line: 1, severity: "error", message: "Missing semicolon.", fix: "Add one." };
    expect(await aiApi.fix({ file: { name: "a.js", content: "let a\n" }, language: "js", issues: [issue] })).toEqual({ content: "let a\n// fixed\n" });
  });

  test("a provider failure keeps its message for the app", async () => {
    const error = await aiApi.rewrite(db, { mode: "fix", text: "busy" }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiFailure);
    expect([error.code, error.status, error.message]).toEqual(["ai_unavailable", 502, "Gemini is busy right now. Try again in a moment."]);
  });

  test("status says whether a key is set up", async () => {
    for (const k of Object.keys(process.env)) if (k.endsWith("_API_KEY")) delete process.env[k];
    expect(await aiApi.status(db)).toEqual({ enabled: false });
  });
});
