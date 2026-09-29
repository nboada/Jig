import { expect, test } from "bun:test";
import { familyMembers, LANGUAGE_CHOICES, languageFamily, withExtension } from "./languages";

test("withExtension swaps only the last extension", () => {
  expect(withExtension("snippet.js", "html")).toBe("snippet.html");
  expect(withExtension("hero.module.css", "scss")).toBe("hero.module.scss");
  expect(withExtension("Makefile", "bash")).toBe("Makefile.sh");
});

test("families group relatives under their lead", () => {
  expect(languageFamily("tsx")).toBe("javascript");
  expect(languageFamily("scss")).toBe("css");
  expect(languageFamily("php")).toBe("php");
  expect(familyMembers("css")).toEqual(["css", "scss"]);
  expect(LANGUAGE_CHOICES.map((l) => l.id)).not.toContain("tsx");
});
