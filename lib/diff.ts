import { structuredPatch } from "diff";
import type { NoteVersion } from "./notes";
import type { SnippetVersion } from "./snippets";

export type DiffLine = { kind: "hunk" | "add" | "del" | "ctx"; text: string };

export type FileDiff = {
  name: string;
  status: "added" | "removed" | "modified" | "unchanged";
  additions: number;
  deletions: number;
  lines: DiffLine[];
};

export type FieldChange = { field: string; from: string; to: string };

export type VersionDiff = {
  from: number;
  to: number;
  fields: FieldChange[];
  files: FileDiff[];
};

export function diffFile(name: string, before: string | undefined, after: string | undefined): FileDiff {
  const status =
    before === undefined ? "added" : after === undefined ? "removed" : before === after ? "unchanged" : "modified";
  const patch = structuredPatch(name, name, before ?? "", after ?? "", "", "", { context: 3 });
  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  for (const hunk of patch.hunks) {
    lines.push({ kind: "hunk", text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` });
    for (const line of hunk.lines) {
      if (line.startsWith("\\")) continue; // "\ No newline at end of file"
      const kind = line[0] === "+" ? "add" : line[0] === "-" ? "del" : "ctx";
      if (kind === "add") additions++;
      if (kind === "del") deletions++;
      lines.push({ kind, text: line.slice(1) });
    }
  }
  return { name, status, additions, deletions, lines };
}

const show = (value: unknown) => (Array.isArray(value) ? value.join(", ") || "(none)" : String(value || "(empty)"));

/** Compares two versions of a snippet: changed metadata fields plus a line diff per file. */
export function compareVersions(a: SnippetVersion, b: SnippetVersion): VersionDiff {
  const fields: FieldChange[] = [];
  for (const field of ["title", "description", "language", "tags", "dependencies", "instructions"] as const) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) {
      fields.push({ field, from: show(a[field]), to: show(b[field]) });
    }
  }

  const before = new Map(a.files.map((f) => [f.name, f.content]));
  const after = new Map(b.files.map((f) => [f.name, f.content]));
  const names = [...new Set([...before.keys(), ...after.keys()])];
  const files = names.map((name) => diffFile(name, before.get(name), after.get(name)));

  return { from: a.version, to: b.version, fields, files };
}

/** Renders a diff as a unified-diff style text block, for agents and terminals. */
export function formatDiff(diff: VersionDiff): string {
  const out: string[] = [`Changes from version ${diff.from} to version ${diff.to}`];
  if (diff.fields.length) {
    out.push("", "Metadata:");
    for (const f of diff.fields) out.push(`- ${f.field}: ${f.from} -> ${f.to}`);
  }
  const changed = diff.files.filter((f) => f.status !== "unchanged");
  if (!changed.length && !diff.fields.length) out.push("", "No differences.");
  for (const file of changed) {
    out.push("", `--- ${file.status === "added" ? "/dev/null" : `a/${file.name}`}`);
    out.push(`+++ ${file.status === "removed" ? "/dev/null" : `b/${file.name}`}`);
    for (const line of file.lines) {
      out.push(line.kind === "hunk" ? line.text : `${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}${line.text}`);
    }
  }
  return out.join("\n");
}

/** Compares two versions of a note. The body is shown as one file, "Body", so DiffView works unchanged. */
export function compareNotes(a: NoteVersion, b: NoteVersion): VersionDiff {
  const fields: FieldChange[] = [];
  for (const field of ["title", "tags"] as const) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) {
      fields.push({ field, from: show(a[field]), to: show(b[field]) });
    }
  }
  return { from: a.version, to: b.version, fields, files: [diffFile("Body", a.body, b.body)] };
}
