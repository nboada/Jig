import type { z } from "zod";
import { AiError, editFile, fixFile, review, rewrite } from "./ai";
import { EditInput, FixInput, ReviewInput, RewriteInput } from "./ai-input";
import { resolveAi } from "./ai-settings";
import type { Body } from "./api";
import { ApiFailure } from "./api-http";
import type { Db } from "./db";
import { getNote } from "./notes";
import { SnippetError } from "./snippets";

// The dashboard's AI checks for the apps. Kept out of lib/api.ts because the AI keys are stored encrypted, and
// that module must never reach the key. Like the dashboard, locked notes are never sent and keys stay on the server.

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SnippetError(result.error.issues[0]?.message ?? "That request doesn't look right.", "invalid");
  return result.data;
}

async function ask<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AiError) throw new ApiFailure("ai_unavailable", error.message, 502);
    throw error;
  }
}

export const aiApi = {
  status: async (db: Db) => ({ enabled: (await resolveAi(db)) !== null }),

  async rewrite(db: Db, body: Body) {
    const { mode, text, instruction } = parse(RewriteInput, body);
    if (body.slug !== undefined && body.slug !== null) {
      if (typeof body.slug !== "string") throw new SnippetError("slug must be a string.", "invalid");
      const note = await getNote(db, body.slug);
      if (note?.locked) throw new SnippetError("Locked notes are never sent to the AI.", "invalid");
    }
    return { text: await ask(() => rewrite(mode, text, instruction)) };
  },

  async review(body: Body) {
    const input = parse(ReviewInput, body);
    if (!input.files.some((f) => f.content.trim())) throw new SnippetError("There's no code to check yet.", "invalid");
    return ask(() => review(input));
  },

  async edit(body: Body) {
    const { file, language, instruction } = parse(EditInput, body);
    return { content: await ask(() => editFile(file, language, instruction)) };
  },

  async fix(body: Body) {
    const { file, language, issues } = parse(FixInput, body);
    return { content: await ask(() => fixFile(file, language, issues)) };
  },
};
