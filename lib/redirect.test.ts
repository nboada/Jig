import { describe, expect, test } from "bun:test";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  test("keeps same-site paths", () => {
    expect(safeNext("/snippets/abc?x=1#top")).toBe("/snippets/abc?x=1#top");
    expect(safeNext("/")).toBe("/");
  });

  test("refuses anything that could leave the site", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r\n/evil.com",
      "/%09/evil.com",
      "/%0a/evil.com",
      "/%2f/evil.com",
      "/%5cevil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
