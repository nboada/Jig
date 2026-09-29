import { describe, expect, test } from "bun:test";
import { MarkdownManager } from "@tiptap/markdown";
import { noteExtensions } from "./note-editor";

// What the editor would save for a note it was given, without any edits in between.
const manager = new MarkdownManager({ extensions: noteExtensions });
const roundTrip = (markdown: string) => manager.serialize(manager.parse(markdown)).trim();

describe("notes survive the editor unchanged", () => {
  const cases = [
    "# Title\n\n## Section\n\n### Detail",
    "Some **bold**, *italic*, ~~gone~~ and `code`.",
    "- one\n- two\n  - nested",
    "1. first\n2. second",
    "- [ ] todo\n- [x] done",
    "> a quote",
    "```bash\nshopify theme push --unpublished\n```",
    "See [the docs](https://example.com).",
    "Above\n\n---\n\nBelow",
    "- Akismet: 749782ac1df4\n- ACF Pro License: abc123",
    "Plain line one\n\nPlain line two",
  ];
  for (const markdown of cases) {
    test(JSON.stringify(markdown.slice(0, 40)), () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }
});
