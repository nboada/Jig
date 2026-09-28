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
  /** When set, the update is refused if someone saved a newer version in the meantime. */
  baseVersion: z.number().int().positive().optional(),
});

const noteBodySchema = z.string().max(200_000, "Notes are capped at 200,000 characters");

export const noteInputSchema = z.object({
  title: z.string().trim().min(1, "Give the note a title").max(120),
  slug: slugSchema.optional(),
  tags: tagsSchema.default([]),
  body: noteBodySchema,
  message: z.string().trim().max(500).default(""),
});

export const notePatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  tags: tagsSchema.optional(),
  body: noteBodySchema.optional(),
  message: z.string().trim().max(500).default(""),
  /** When set, the update is refused if someone saved a newer version in the meantime. */
  baseVersion: z.number().int().positive().optional(),
});

export type SnippetInput = z.input<typeof snippetInputSchema>;
export type SnippetPatch = z.input<typeof snippetPatchSchema>;
export type NoteInput = z.input<typeof noteInputSchema>;
export type NotePatch = z.input<typeof notePatchSchema>;
