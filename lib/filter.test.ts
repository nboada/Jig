import { expect, test } from "bun:test";
import { filterItems } from "./filter";

const item = (slug: string, language: string, extra: Partial<{ title: string; tags: string[]; fileNames: string[] }> = {}) => ({
  slug,
  title: extra.title ?? slug,
  description: "",
  language,
  tags: extra.tags ?? [],
  fileNames: extra.fileNames ?? [],
});
const items = [
  item("lenis-defaults", "javascript", { title: "Lenis defaults", tags: ["scroll"] }),
  item("button", "tsx", { fileNames: ["Button.tsx"] }),
  item("hero", "scss", { tags: ["layout"] }),
];
const slugs = (list: { slug: string }[]) => list.map((i) => i.slug);
const none = { query: "", language: "", tag: "" };
const text = (i: (typeof items)[number]) => [i.title, i.slug, i.description, i.tags.join(" "), i.fileNames.join(" ")].join(" ");

test("keeps the order and everything when unfiltered", () => {
  expect(slugs(filterItems(items, none, text))).toEqual(["lenis-defaults", "button", "hero"]);
});

test("every word must match somewhere in the metadata", () => {
  expect(slugs(filterItems(items, { ...none, query: "lenis scroll" }, text))).toEqual(["lenis-defaults"]);
  expect(slugs(filterItems(items, { ...none, query: "button.tsx" }, text))).toEqual(["button"]);
  expect(filterItems(items, { ...none, query: "lenis layout" }, text)).toEqual([]);
});

test("server content hits count as matches", () => {
  expect(slugs(filterItems(items, { ...none, query: "useState" }, text, new Set(["button"])))).toEqual(["button"]);
});

test("language filters by family, tag exactly", () => {
  expect(slugs(filterItems(items, { ...none, language: "javascript" }, text))).toEqual(["lenis-defaults", "button"]);
  expect(slugs(filterItems(items, { ...none, language: "css" }, text))).toEqual(["hero"]);
  expect(slugs(filterItems(items, { ...none, tag: "layout" }, text))).toEqual(["hero"]);
});
