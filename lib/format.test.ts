import { describe, expect, test } from "bun:test";
import { countLabel, plainText, safeHref } from "./format";

describe("safeHref", () => {
  test("links only http and https URLs", () => {
    expect(safeHref("https://acme.myshopify.com/admin")).toBe("https://acme.myshopify.com/admin");
    expect(safeHref("  http://localhost:3000 ")).toBe("http://localhost:3000");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("acme.myshopify.com")).toBeNull();
    expect(safeHref("")).toBeNull();
  });
});

test("countLabel", () => {
  expect(countLabel(1, "note")).toBe("1 note");
  expect(countLabel(4, "snippet")).toBe("4 snippets");
  expect(countLabel(100, "credential")).toBe("100+ credentials");
});

describe("plainText", () => {
  test("drops markdown syntax, keeps the words", () => {
    expect(plainText("- **Akismet:** 749782ac1df4\n- **ACF Pro:** abc")).toBe("Akismet: 749782ac1df4 ACF Pro: abc");
    expect(plainText("## Setup\n\n1. Run `bun install`\n2. See [the docs](https://x.dev)")).toBe(
      "Setup Run bun install See the docs",
    );
    expect(plainText("- [ ] todo\n- [x] done\n> quoted *text* and ~~old~~")).toBe("todo done quoted text and old");
    expect(plainText("Above\n\n---\n\nBelow")).toBe("Above Below");
  });

  test("leaves ordinary text alone", () => {
    expect(plainText("snake_case_name and 2*3*4")).toBe("snake_case_name and 2*3*4");
  });
});
