import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Db } from "./db";
import { compareVersions, formatDiff } from "./diff";
import { languageForFile, languageLabel } from "./languages";
import {
  createSnippet,
  getSnippet,
  getVersionPair,
  listSnippets,
  listTags,
  listVersions,
  restoreVersion,
  SnippetError,
  updateSnippet,
  type Snippet,
  type SnippetSummary,
} from "./snippets";
import { fileSchema, languageSchema } from "./validation";

export const SERVER_INSTRUCTIONS = `Snippeta is the user's personal library of reusable code snippets (JavaScript, PHP, CSS, Liquid and more) shared across their projects.

When the user asks for a snippet "from Snippeta" (e.g. "add the GSAP snippet", "grab my Lenis config"):
1. Call search_snippets with a short query to find it, unless you already know the exact slug.
2. Call get_snippet with the slug to fetch the files, dependencies and integration instructions.
3. Install any listed dependencies with the project's package manager, then adapt the files to the project's structure and conventions. Follow the snippet's instructions.

When the user asks to save or update a snippet, use create_snippet or update_snippet. Every update is saved as a new version, so nothing is ever lost. Always pass a short message describing the change. Use list_snippet_versions, diff_snippet_versions and restore_snippet_version to inspect history or roll back when a snippet stopped working.`;

type Text = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (value: string): Text => ({ content: [{ type: "text", text: value }] });

/** A code fence longer than any run of backticks inside the content. */
function fence(content: string, lang: string) {
  const longest = Math.max(2, ...(content.match(/`+/g) ?? []).map((m) => m.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${lang}\n${content}${content.endsWith("\n") ? "" : "\n"}${ticks}`;
}

function formatSummary(s: SnippetSummary) {
  const tags = s.tags.length ? ` [${s.tags.join(", ")}]` : "";
  const description = s.description ? `\n  ${s.description}` : "";
  return `- ${s.slug}: ${s.title} (${languageLabel(s.language)}, v${s.version}, files: ${s.fileNames.join(", ")})${tags}${description}`;
}

export function formatSnippet(s: Snippet): string {
  const out = [
    `# ${s.title}`,
    "",
    `Slug: ${s.slug}`,
    `Version: ${s.version}${s.version === s.currentVersion ? " (latest)" : ` of ${s.currentVersion} (older version)`}`,
    `Language: ${languageLabel(s.language)}`,
  ];
  if (s.tags.length) out.push(`Tags: ${s.tags.join(", ")}`);
  out.push(`Saved: ${s.versionCreatedAt}${s.message ? ` (${s.message})` : ""}`);
  if (s.description) out.push("", s.description);
  if (s.dependencies.length) out.push("", "## Dependencies", "", ...s.dependencies.map((d) => `- ${d}`));
  if (s.instructions) out.push("", "## Instructions", "", s.instructions);
  out.push("", "## Files");
  for (const file of s.files) {
    out.push("", `### ${file.name}`, "", fence(file.content, languageForFile(file.name, s.language)));
  }
  return out.join("\n");
}

async function run(fn: () => Promise<Text>): Promise<Text> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof SnippetError) return { ...text(error.message), isError: true };
    console.error("[snippeta] tool failed", error);
    return { ...text("Something went wrong on the Snippeta server. Try again."), isError: true };
  }
}

/** Who made a change, recorded on each version: "mcp:<token name>". */
const sourceOf = (ctx: ServerContext) => `mcp:${ctx.http?.authInfo?.clientId ?? "agent"}`;

const slugArg = z.string().trim().min(1).describe("The snippet's slug, e.g. gsap-scroll-trigger. Find it with search_snippets.");

const editableFields = {
  description: z.string().optional().describe("One or two sentences on what the snippet does and when to use it."),
  language: languageSchema.optional().describe("Primary language, used for filtering."),
  tags: z.array(z.string()).optional().describe("Lowercase keywords, e.g. [\"gsap\", \"animation\"]."),
  instructions: z
    .string()
    .optional()
    .describe("How an agent should integrate the snippet into a project: where files go, setup steps, gotchas. Markdown."),
  dependencies: z
    .array(z.string())
    .optional()
    .describe("Packages to install, e.g. [\"gsap@^3.13\", \"lenis\"]. Composer packages use vendor/name."),
};

export function registerTools(server: McpServer, getDb: () => Promise<Db>) {
  server.registerTool(
    "search_snippets",
    {
      title: "Search snippets",
      description:
        "Find snippets by keyword, language or tag. Matches titles, slugs, descriptions, tags and file contents. Call with no arguments to list everything.",
      inputSchema: z.object({
        query: z.string().optional().describe("Keywords, e.g. \"gsap scroll\" or \"lenis\"."),
        language: languageSchema.optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ query, language, tag, limit }) =>
      run(async () => {
        const db = await getDb();
        const results = await listSnippets(db, { query, language, tag, limit: limit ?? 50 });
        if (results.length) return text(`${results.length} snippet(s):\n\n${results.map(formatSummary).join("\n")}`);
        const tags = await listTags(db);
        return text(
          `No snippets matched.${tags.length ? ` Tags in use: ${tags.map((t) => t.tag).join(", ")}.` : " The library is empty."}`,
        );
      }),
  );

  server.registerTool(
    "get_snippet",
    {
      title: "Get snippet",
      description:
        "Fetch a snippet's files, dependencies and integration instructions. Returns the latest version unless a version number is given.",
      inputSchema: z.object({
        slug: slugArg,
        version: z.number().int().positive().optional().describe("A specific version from list_snippet_versions."),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ slug, version }) =>
      run(async () => {
        const db = await getDb();
        const snippet = await getSnippet(db, slug, version);
        if (snippet) return text(formatSnippet(snippet));
        if (version && (await getSnippet(db, slug))) throw new SnippetError(`"${slug}" has no version ${version}.`, "not_found");
        const guesses = await listSnippets(db, { query: slug.replace(/[-_]+/g, " "), limit: 5 });
        return {
          ...text(
            guesses.length
              ? `No snippet with the slug "${slug}". Did you mean one of these?\n\n${guesses.map(formatSummary).join("\n")}`
              : `No snippet with the slug "${slug}". Use search_snippets to find it.`,
          ),
          isError: true,
        };
      }),
  );

  server.registerTool(
    "create_snippet",
    {
      title: "Create snippet",
      description:
        "Save a new snippet to the library. A snippet can hold several files (e.g. a JS file and its CSS). Version 1 is created.",
      inputSchema: z.object({
        title: z.string().describe("Short human title, e.g. \"Lenis smooth scroll setup\"."),
        slug: z.string().optional().describe("Optional; derived from the title when left out."),
        ...editableFields,
        language: languageSchema.describe("Primary language, used for filtering."),
        files: z.array(fileSchema).min(1).describe("The files, each with a name (e.g. lenis.js) and full content."),
        message: z.string().optional().describe("Why the snippet was created, for the history."),
      }),
    },
    (args, ctx) =>
      run(async () => {
        const snippet = await createSnippet(await getDb(), args, sourceOf(ctx));
        return text(`Created "${snippet.title}" as ${snippet.slug} (version 1).`);
      }),
  );

  server.registerTool(
    "update_snippet",
    {
      title: "Update snippet",
      description:
        "Save a new version of a snippet. Only pass the fields that change; the rest carry over. `files` replaces the full file list, so include unchanged files too. Earlier versions stay in the history.",
      inputSchema: z.object({
        slug: slugArg,
        title: z.string().optional(),
        ...editableFields,
        files: z.array(fileSchema).min(1).optional().describe("The complete new file list."),
        message: z.string().describe("What changed and why, e.g. \"Bump to GSAP 3.13, add reduced motion check\"."),
        baseVersion: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("The version your edit is based on. The update is refused if a newer version was saved since."),
      }),
    },
    ({ slug, ...patch }, ctx) =>
      run(async () => {
        const { snippet, changed } = await updateSnippet(await getDb(), slug, patch, sourceOf(ctx));
        return text(
          changed
            ? `Saved ${snippet.slug} as version ${snippet.version}.`
            : `Nothing changed, ${snippet.slug} is still at version ${snippet.version}.`,
        );
      }),
  );

  server.registerTool(
    "list_snippet_versions",
    {
      title: "List snippet versions",
      description: "Show the version history of a snippet, newest first, with each change message.",
      inputSchema: z.object({ slug: slugArg }),
      annotations: { readOnlyHint: true },
    },
    ({ slug }) =>
      run(async () => {
        const versions = await listVersions(await getDb(), slug);
        const lines = versions.map(
          (v, i) =>
            `- v${v.version}${i === 0 ? " (latest)" : ""}, ${v.createdAt}, by ${v.source}: ${v.message || "(no message)"}`,
        );
        return text(`History of ${slug}:\n\n${lines.join("\n")}`);
      }),
  );

  server.registerTool(
    "diff_snippet_versions",
    {
      title: "Diff snippet versions",
      description: "Show what changed between two versions of a snippet as a unified diff. Useful to find what broke.",
      inputSchema: z.object({
        slug: slugArg,
        from: z.number().int().positive().describe("The older version."),
        to: z.number().int().positive().optional().describe("The newer version. Defaults to the latest."),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ slug, from, to }) =>
      run(async () => {
        const [a, b] = await getVersionPair(await getDb(), slug, from, to);
        return text(formatDiff(compareVersions(a, b)));
      }),
  );

  server.registerTool(
    "restore_snippet_version",
    {
      title: "Restore snippet version",
      description:
        "Roll a snippet back to an earlier version. This saves a new version with the old content, so the rollback can itself be undone.",
      inputSchema: z.object({
        slug: slugArg,
        version: z.number().int().positive().describe("The version to bring back."),
        message: z.string().optional(),
      }),
    },
    ({ slug, version, message }, ctx) =>
      run(async () => {
        const snippet = await restoreVersion(await getDb(), slug, version, sourceOf(ctx), message);
        return text(`Restored ${slug} to the content of version ${version}. It is now version ${snippet.version}.`);
      }),
  );
}
