import { expect, test } from "bun:test";
import { renameForTitle, slugify } from "./slug";

const names = (files: { name: string }[]) => files.map((f) => f.name);

test("slugify", () => {
  expect(slugify("Same height divs")).toBe("same-height-divs");
  expect(slugify("")).toBe("snippet");
});

test("automatic names follow the title, hand-picked ones stay", () => {
  const files = [{ name: "snippet.js" }, { name: "snippet.css" }, { name: "equalize.js" }];
  expect(names(renameForTitle(files, "", "Same height divs"))).toEqual([
    "same-height-divs.js",
    "same-height-divs.css",
    "equalize.js",
  ]);
});

test("a name that followed the old title follows the new one", () => {
  const files = [{ name: "same-height-divs.js" }];
  expect(names(renameForTitle(files, "Same height divs", "Equal heights"))).toEqual(["equal-heights.js"]);
  // Clearing the title goes back to snippet.js.
  expect(names(renameForTitle(files, "Same height divs", ""))).toEqual(["snippet.js"]);
});

test("never renames onto another file", () => {
  const files = [{ name: "snippet.js" }, { name: "hero.js" }];
  expect(names(renameForTitle(files, "", "Hero"))).toEqual(["snippet.js", "hero.js"]);
});

test("keeps other fields", () => {
  expect(renameForTitle([{ name: "snippet.php", content: "<?php" }], "", "Enqueue")).toEqual([
    { name: "enqueue.php", content: "<?php" },
  ]);
});
