import { expect, test } from "bun:test";
import { parseSort, sortItems } from "./sort";

const items = [
  { slug: "bravo", title: "Bravo", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-04T00:00:00.000Z" },
  { slug: "alpha", title: "alpha", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
  { slug: "charlie", title: "Charlie", createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" },
];
const slugs = (list: { slug: string }[]) => list.map((i) => i.slug);

test("browser sorting matches the database's orders", () => {
  // The same expectations as the listSnippets sorting test, so the two agree.
  expect(slugs(sortItems(items, "updated"))).toEqual(["bravo", "charlie", "alpha"]);
  expect(slugs(sortItems(items, "created"))).toEqual(["charlie", "alpha", "bravo"]);
  expect(slugs(sortItems(items, "title"))).toEqual(["alpha", "bravo", "charlie"]);
});

test("does not change the list it was given", () => {
  sortItems(items, "title");
  expect(slugs(items)).toEqual(["bravo", "alpha", "charlie"]);
});

test("parseSort falls back to the default", () => {
  expect(parseSort("title")).toBe("title");
  expect(parseSort("nonsense")).toBe("updated");
  expect(parseSort(undefined)).toBe("updated");
});

test("pinned items come first, sorted among themselves", () => {
  const withPins = items.map((i) => ({ ...i, pinned: i.slug !== "bravo" }));
  expect(slugs(sortItems(withPins, "title"))).toEqual(["alpha", "charlie", "bravo"]);
  expect(slugs(sortItems(withPins, "updated"))).toEqual(["charlie", "alpha", "bravo"]);
});
