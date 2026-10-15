import { describe, expect, test } from "bun:test";
import { EditInput, FixInput, ReviewInput, RewriteInput } from "./ai-input";

const big = "x".repeat(200_001);

describe("AI input limits", () => {
  test("text and file content are capped like snippet files", () => {
    expect(RewriteInput.safeParse({ mode: "fix", text: big }).success).toBe(false);
    expect(RewriteInput.safeParse({ mode: "fix", text: "ok" }).success).toBe(true);
    expect(EditInput.safeParse({ file: { name: "a.js", content: big }, language: "javascript", instruction: "do" }).success).toBe(false);
    expect(FixInput.safeParse({ file: { name: "a.js", content: big }, language: "javascript", issues: [] }).success).toBe(false);
    const files = [{ name: "a.js", content: big }];
    expect(ReviewInput.safeParse({ title: "t", language: "javascript", instructions: "", files }).success).toBe(false);
  });

  test("a review takes at most 20 files, like a snippet", () => {
    const files = Array.from({ length: 21 }, (_, i) => ({ name: `${i}.js`, content: "1" }));
    expect(ReviewInput.safeParse({ title: "t", language: "javascript", instructions: "", files }).success).toBe(false);
    expect(ReviewInput.safeParse({ title: "t", language: "javascript", instructions: "", files: files.slice(0, 20) }).success).toBe(true);
  });
});
