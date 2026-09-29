import { describe, expect, test } from "bun:test";
import { countLabel, safeHref } from "./format";

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
