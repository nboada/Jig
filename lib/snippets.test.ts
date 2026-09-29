import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { compareVersions, formatDiff } from "./diff";
import {
  cloneSnippet,
  createSnippet,
  deleteSnippet,
  getSnippet,
  getVersionPair,
  listSnippets,
  listTags,
  listVersions,
  restoreVersion,
  setSnippetPinned,
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

  test("a family filter matches every member, an exact one only itself", async () => {
    await createSnippet(db, { title: "Plain JS", language: "javascript", files: [{ name: "a.js", content: "1" }] });
    await createSnippet(db, { title: "Button", language: "tsx", files: [{ name: "Button.tsx", content: "2" }] });
    await createSnippet(db, { title: "Mixins", language: "scss", files: [{ name: "m.scss", content: "3" }] });

    const slugs = async (language: string) => (await listSnippets(db, { language })).map((s) => s.slug).sort();
    expect(await slugs("javascript")).toEqual(["button", "plain-js"]);
    expect(await slugs("tsx")).toEqual(["button"]);
    expect(await slugs("css")).toEqual(["mixins"]);
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
    expect(token.startsWith("jig_")).toBe(true);
    expect((await verifyToken(db, token))?.name).toBe("Claude Code");
    expect(await verifyToken(db, "jig_wrong")).toBeNull();
    expect(await verifyToken(db, undefined)).toBeNull();

    const [listed] = await listTokens(db);
    expect(listed.lastUsedAt).not.toBeNull();
    const rows = await db.query(`SELECT token_hash FROM api_tokens`);
    expect(rows[0].token_hash).not.toBe(token);

    await revokeToken(db, record.id);
    expect(await verifyToken(db, token)).toBeNull();
  });

  test("tokens from before the rename to Jig still verify", async () => {
    const legacy = "snp_legacy-token";
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(legacy))).toString("hex");
    await db.query(`INSERT INTO api_tokens (id, name, token_hash, prefix) VALUES ('t1', 'Old agent', $1, 'snp_legac')`, [hash]);
    expect((await verifyToken(db, legacy))?.name).toBe("Old agent");
    expect(await verifyToken(db, "abc_legacy-token")).toBeNull();
  });
});

describe("sorting", () => {
  test("recently edited, newest and title order", async () => {
    const file = [{ name: "a.css", content: "a{}" }];
    await createSnippet(db, { title: "Bravo", language: "css", files: file });
    await createSnippet(db, { title: "alpha", language: "css", files: file });
    await createSnippet(db, { title: "Charlie", language: "css", files: file });
    // Pin the times: created Bravo, alpha, Charlie in that order, then Bravo edited last.
    await db.query(`UPDATE snippets SET created_at = $2, updated_at = $3 WHERE slug = $1`, ["bravo", "2026-01-01", "2026-01-04"]);
    await db.query(`UPDATE snippets SET created_at = $2, updated_at = $3 WHERE slug = $1`, ["alpha", "2026-01-02", "2026-01-02"]);
    await db.query(`UPDATE snippets SET created_at = $2, updated_at = $3 WHERE slug = $1`, ["charlie", "2026-01-03", "2026-01-03"]);

    const order = async (sort: "updated" | "created" | "title") =>
      (await listSnippets(db, { sort })).map((s) => s.slug);
    expect(await order("updated")).toEqual(["bravo", "charlie", "alpha"]);
    expect(await order("created")).toEqual(["charlie", "alpha", "bravo"]);
    // Case-insensitive: "alpha" sorts before "Bravo".
    expect(await order("title")).toEqual(["alpha", "bravo", "charlie"]);
  });
});

describe("cloning", () => {
  test("a copy gets its own slug and history, and files named after the title follow it", async () => {
    await createSnippet(db, {
      title: "Lenis defaults",
      language: "javascript",
      tags: ["scroll"],
      dependencies: ["lenis"],
      instructions: "Import once.",
      files: [
        { name: "lenis-defaults.js", content: "init()" },
        { name: "setup.css", content: "html{}" },
      ],
    });
    await updateSnippet(db, "lenis-defaults", { description: "Smooth scroll" });

    const copy = await cloneSnippet(db, "lenis-defaults");
    expect(copy.slug).toBe("lenis-defaults-copy");
    expect(copy.title).toBe("Lenis defaults copy");
    expect(copy.currentVersion).toBe(1);
    expect(copy.message).toBe("Copied from lenis-defaults");
    expect(copy.files.map((f) => f.name)).toEqual(["lenis-defaults-copy.js", "setup.css"]);
    expect([copy.description, copy.tags, copy.dependencies, copy.instructions]).toEqual([
      "Smooth scroll",
      ["scroll"],
      ["lenis"],
      "Import once.",
    ]);

    // The original is untouched, and a second copy gets the next free slug.
    expect((await getSnippet(db, "lenis-defaults"))?.currentVersion).toBe(2);
    expect((await cloneSnippet(db, "lenis-defaults")).slug).toBe("lenis-defaults-copy-2");
  });

  test("cloning something that is not there says so", async () => {
    await expect(cloneSnippet(db, "missing")).rejects.toThrow('No snippet called "missing".');
  });
});

describe("pinning", () => {
  test("pinned snippets come first in every order, and pinning makes no new version", async () => {
    const file = [{ name: "a.css", content: "a{}" }];
    for (const title of ["Alpha", "Bravo", "Charlie"]) await createSnippet(db, { title, language: "css", files: file });
    await setSnippetPinned(db, "charlie", true);

    const order = async (sort: "updated" | "created" | "title") => (await listSnippets(db, { sort })).map((s) => s.slug);
    expect((await order("title"))[0]).toBe("charlie");
    expect(await order("title")).toEqual(["charlie", "alpha", "bravo"]);
    expect((await listSnippets(db, { sort: "title" })).map((s) => s.pinned)).toEqual([true, false, false]);

    const charlie = await getSnippet(db, "charlie");
    expect([charlie?.pinned, charlie?.currentVersion]).toEqual([true, 1]);

    // Pinning again keeps it pinned; unpinning puts it back in the normal order.
    await setSnippetPinned(db, "charlie", true);
    await setSnippetPinned(db, "charlie", false);
    expect(await order("title")).toEqual(["alpha", "bravo", "charlie"]);
  });

  test("pinning something that is not there says so", async () => {
    await expect(setSnippetPinned(db, "missing", true)).rejects.toThrow('No snippet called "missing".');
  });
});
