import { z } from "zod";
import { LANGUAGE_IDS } from "./languages";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens, e.g. gsap-scroll-trigger");

export const fileSchema = z.object({
  name: z.string().trim().min(1, "Every file needs a name").max(200),
  content: z.string().max(200_000, "Files are capped at 200,000 characters"),
});

const tagsSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(20)
  .transform((tags) => [...new Set(tags)]);

const dependenciesSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(50)
  .transform((deps) => [...new Set(deps)]);

const filesSchema = z
  .array(fileSchema)
  .min(1, "A snippet needs at least one file")
  .max(20)
  .refine((files) => new Set(files.map((f) => f.name)).size === files.length, "File names must be unique");

export const languageSchema = z.enum(LANGUAGE_IDS);

export const snippetInputSchema = z.object({
  title: z.string().trim().min(1, "Give the snippet a title").max(120),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).default(""),
  language: languageSchema,
  tags: tagsSchema.default([]),
  instructions: z.string().trim().max(20_000).default(""),
  dependencies: dependenciesSchema.default([]),
  files: filesSchema,
  message: z.string().trim().max(500).default(""),
});

export const snippetPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  language: languageSchema.optional(),
  tags: tagsSchema.optional(),
  instructions: z.string().trim().max(20_000).optional(),
  dependencies: dependenciesSchema.optional(),
  files: filesSchema.optional(),
  message: z.string().trim().max(500).default(""),
  baseVersion: z.number().int().positive().optional(),
});

const noteBodySchema = z.string().max(200_000, "Notes are capped at 200,000 characters");

/** A note's first line of text, like Apple Notes, for notes saved without a title. */
export function titleFromBody(body: string): string {
  for (const raw of body.split("\n")) {
    const line = raw
      .replace(/^\s*(?:```.*|>+|#{1,6}|[-*+]|\d+[.)])?\s*(?:\[[ xX]\]\s*)?/, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/(\*\*|__|~~|`|\*|_)/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) return line.length > 120 ? `${line.slice(0, 119).trimEnd()}…` : line;
  }
  return "";
}

export const noteInputSchema = z
  .object({
    title: z.string().trim().max(120).default(""),
    slug: slugSchema.optional(),
    tags: tagsSchema.default([]),
    body: noteBodySchema,
    message: z.string().trim().max(500).default(""),
  })
  .transform((note) => ({ ...note, title: note.title || titleFromBody(note.body) || "Untitled" }));

export const notePatchSchema = z.object({
  title: z.string().trim().max(120).optional(),
  tags: tagsSchema.optional(),
  body: noteBodySchema.optional(),
  message: z.string().trim().max(500).default(""),
  baseVersion: z.number().int().positive().optional(),
});

const credentialFieldSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  label: z.string().trim().min(1, "Every field needs a label").max(80),
  secret: z.boolean(),
  value: z.string().max(10_000, "Values are capped at 10,000 characters"),
});

export const credentialInputSchema = z.object({
  title: z.string().trim().min(1, "Give the credential a title").max(120),
  slug: slugSchema.optional(),
  url: z.string().trim().max(2000).default(""),
  tags: tagsSchema.default([]),
  note: z.string().trim().max(5000).default(""),
  fields: z.array(credentialFieldSchema).min(1, "Add at least one field").max(30),
});

export type SnippetInput = z.input<typeof snippetInputSchema>;
export type SnippetPatch = z.input<typeof snippetPatchSchema>;
export type NoteInput = z.input<typeof noteInputSchema>;
export type NotePatch = z.input<typeof notePatchSchema>;
export type CredentialInput = z.input<typeof credentialInputSchema>;
