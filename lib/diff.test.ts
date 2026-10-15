import { describe, expect, test } from "bun:test";
import { diffFile, formatDiff } from "./diff";

describe("diffFile", () => {
  test("a changed line counts once each way", () => {
    const diff = diffFile("a.js", "one\ntwo\n", "one\nthree\n");
    expect([diff.status, diff.additions, diff.deletions]).toEqual(["modified", 1, 1]);
    expect(diff.lines.map((l) => [l.kind, l.text])).toEqual([
      ["hunk", "@@ -1,2 +1,2 @@"],
      ["ctx", "one"],
      ["del", "two"],
      ["add", "three"],
    ]);
  });

  test("a trailing-newline-only change is shown as a change that says why", () => {
    const removed = diffFile("a.js", "a\n", "a");
    expect([removed.status, removed.additions, removed.deletions]).toEqual(["modified", 1, 1]);
    expect(removed.lines.filter((l) => l.noNewline).map((l) => [l.kind, l.text])).toEqual([["add", "a"]]);

    const added = diffFile("a.js", "a", "a\n");
    expect(added.lines.filter((l) => l.noNewline).map((l) => [l.kind, l.text])).toEqual([["del", "a"]]);
  });

  test("the unified text keeps the no-newline marker", () => {
    const text = formatDiff({ from: 1, to: 2, fields: [], files: [diffFile("a.js", "a\n", "a")] });
    expect(text).toContain("-a\n+a\n\\ No newline at end of file");
  });

  test("identical, added and removed files", () => {
    expect(diffFile("a", "x", "x").status).toBe("unchanged");
    expect(diffFile("a", undefined, "x\n")).toMatchObject({ status: "added", additions: 1, deletions: 0 });
    expect(diffFile("a", "x\n", undefined)).toMatchObject({ status: "removed", additions: 0, deletions: 1 });
  });
});
