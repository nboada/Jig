import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { compareVersions, formatDiff } from "./diff";
import {
  createSnippet,
  deleteSnippet,
  getSnippet,
  getVersionPair,
  listSnippets,
  listTags,
  listVersions,
  restoreVersion,
  slugify,
  updateSnippet,
} from "./snippets";
import { createToken, listTokens, revokeToken, verifyToken } from "./tokens";

let db: Db;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE snippets, snippet_versions, api_tokens`);
});

const gsap = {
  title: "GSAP ScrollTrigger setup",
  description: "Registers ScrollTrigger and fades sections in.",
  language: "javascript" as const,
  tags: ["GSAP", "animation"],
  dependencies: ["gsap@^3.13"],
  instructions: "Import once in the main entry file.",
  files: [{ name: "gsap.js", content: "import gsap from 'gsap';\ngsap.registerPlugin(ScrollTrigger);\n" }],
};

describe("slugify", () => {
  test("makes readable slugs", () => {
    expect(slugify("GSAP ScrollTrigger setup!")).toBe("gsap-scrolltrigger-setup");
    expect(slugify("Café  menu")).toBe("cafe-menu");
    expect(slugify("!!!")).toBe("snippet");
  });
});

describe("snippets", () => {
  test("create stores version 1 and normalises tags", async () => {
    const s = await createSnippet(db, gsap);
    expect(s.slug).toBe("gsap-scrolltrigger-setup");
    expect(s.version).toBe(1);
    expect(s.currentVersion).toBe(1);
    expect(s.tags).toEqual(["gsap", "animation"]);
    expect(s.message).toBe("Created");
  });

  test("clashing titles get a numbered slug, explicit clashing slugs are refused", async () => {
    await createSnippet(db, gsap);
    expect((await createSnippet(db, gsap)).slug).toBe("gsap-scrolltrigger-setup-2");
    expect(createSnippet(db, { ...gsap, slug: "gsap-scrolltrigger-setup" })).rejects.toThrow("already taken");
  });

  test("rejects invalid input with a readable message", async () => {
    expect(createSnippet(db, { ...gsap, files: [] })).rejects.toThrow("at least one file");
    expect(
      createSnippet(db, { ...gsap, files: [gsap.files[0], gsap.files[0]] }),
    ).rejects.toThrow("unique");
  });

  test("update creates a new version and keeps the old one", async () => {
    await createSnippet(db, gsap);
    const { snippet, changed } = await updateSnippet(db, "gsap-scrolltrigger-setup", {
      files: [{ name: "gsap.js", content: "// v2\n" }],
      message: "Rewrite",
    }, "mcp:claude");
    expect(changed).toBe(true);
    expect(snippet.version).toBe(2);
    expect(snippet.title).toBe(gsap.title);
    expect(snippet.source).toBe("mcp:claude");

    const v1 = await getSnippet(db, "gsap-scrolltrigger-setup", 1);
    expect(v1?.files[0].content).toContain("registerPlugin");
    expect(v1?.currentVersion).toBe(2);

    const history = await listVersions(db, "gsap-scrolltrigger-setup");
    expect(history.map((v) => [v.version, v.message])).toEqual([
      [2, "Rewrite"],
      [1, "Created"],
    ]);
  });

  test("an update with no real change saves nothing", async () => {
    await createSnippet(db, gsap);
    const { snippet, changed } = await updateSnippet(db, "gsap-scrolltrigger-setup", { title: gsap.title });
    expect(changed).toBe(false);
    expect(snippet.version).toBe(1);
  });

  test("an update based on a stale version is refused", async () => {
    await createSnippet(db, gsap);
    await updateSnippet(db, "gsap-scrolltrigger-setup", { description: "Changed" });
    expect(
      updateSnippet(db, "gsap-scrolltrigger-setup", { description: "Mine", baseVersion: 1 }),
    ).rejects.toThrow("was changed since version 1");
  });

  test("restore copies an old version forward", async () => {
    await createSnippet(db, gsap);
    await updateSnippet(db, "gsap-scrolltrigger-setup", { files: [{ name: "gsap.js", content: "broken" }] });
    const restored = await restoreVersion(db, "gsap-scrolltrigger-setup", 1);
    expect(restored.version).toBe(3);
    expect(restored.files).toEqual(gsap.files);
    expect(restored.message).toBe("Restored version 1");
    expect(restoreVersion(db, "gsap-scrolltrigger-setup", 3)).rejects.toThrow("already the latest");
  });

  test("search matches titles, tags and file contents, filters by language and tag", async () => {
    await createSnippet(db, gsap);
    await createSnippet(db, {
      title: "Lenis smooth scroll",
      language: "javascript",
      tags: ["scroll"],
      files: [{ name: "lenis.js", content: "import Lenis from 'lenis'; // pairs with gsap ticker" }],
    });
    await createSnippet(db, {
      title: "WP enqueue",
      language: "php",
      files: [{ name: "functions.php", content: "<?php wp_enqueue_script('x');" }],
    });

    expect((await listSnippets(db)).length).toBe(3);
    const gsapHits = await listSnippets(db, { query: "gsap" });
    expect(gsapHits.map((s) => s.slug)).toEqual(["gsap-scrolltrigger-setup", "lenis-smooth-scroll"]);
    expect((await listSnippets(db, { query: "lenis scroll" })).map((s) => s.slug)).toEqual(["lenis-smooth-scroll"]);
    expect((await listSnippets(db, { language: "php" })).map((s) => s.slug)).toEqual(["wp-enqueue"]);
    expect((await listSnippets(db, { tag: "Animation" })).map((s) => s.slug)).toEqual(["gsap-scrolltrigger-setup"]);
    expect((await listSnippets(db, { query: "100%" })).length).toBe(0);
    expect(await listTags(db)).toEqual([
      { tag: "animation", count: 1 },
      { tag: "gsap", count: 1 },
      { tag: "scroll", count: 1 },
    ]);
  });

  test("delete removes the snippet and its history", async () => {
    await createSnippet(db, gsap);
    await deleteSnippet(db, "gsap-scrolltrigger-setup");
    expect(await getSnippet(db, "gsap-scrolltrigger-setup")).toBeNull();
    expect(listVersions(db, "gsap-scrolltrigger-setup")).rejects.toThrow("No snippet");
  });
});

describe("diff", () => {
  test("reports metadata and file changes", async () => {
    await createSnippet(db, gsap);
    await updateSnippet(db, "gsap-scrolltrigger-setup", {
      tags: ["gsap"],
      files: [
        { name: "gsap.js", content: "import gsap from 'gsap';\ngsap.registerPlugin(ScrollTrigger, SplitText);\n" },
        { name: "gsap.css", content: ".fade { opacity: 0; }\n" },
      ],
    });
    const [a, b] = await getVersionPair(db, "gsap-scrolltrigger-setup", 1);
    const diff = compareVersions(a, b);
    expect(diff.fields).toEqual([{ field: "tags", from: "gsap, animation", to: "gsap" }]);
    expect(diff.files.map((f) => [f.name, f.status, f.additions, f.deletions])).toEqual([
      ["gsap.js", "modified", 1, 1],
      ["gsap.css", "added", 1, 0],
    ]);
    const text = formatDiff(diff);
    expect(text).toContain("-gsap.registerPlugin(ScrollTrigger);");
    expect(text).toContain("+gsap.registerPlugin(ScrollTrigger, SplitText);");
    expect(text).toContain("--- /dev/null");
  });
});

describe("tokens", () => {
  test("a token verifies until revoked and is stored hashed", async () => {
    const { token, record } = await createToken(db, "Claude Code");
    expect(token.startsWith("snp_")).toBe(true);
    expect((await verifyToken(db, token))?.name).toBe("Claude Code");
    expect(await verifyToken(db, "snp_wrong")).toBeNull();
    expect(await verifyToken(db, undefined)).toBeNull();

    const [listed] = await listTokens(db);
    expect(listed.lastUsedAt).not.toBeNull();
    const rows = await db.query(`SELECT token_hash FROM api_tokens`);
    expect(rows[0].token_hash).not.toBe(token);

    await revokeToken(db, record.id);
    expect(await verifyToken(db, token)).toBeNull();
  });
});
