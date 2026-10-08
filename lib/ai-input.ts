import { z } from "zod";

// What the dashboard's AI actions and the app API accept, so both front doors check the same limits.

const Instruction = z.string().trim().min(1, "Say what the AI should do.").max(2000);

export const RewriteInput = z
  .object({
    mode: z.enum(["rephrase", "shorten", "fix", "custom"]),
    text: z.string().trim().min(1, "Select some text first."),
    instruction: Instruction.optional(),
  })
  .refine((input) => input.mode !== "custom" || input.instruction, { message: "Say what the AI should do.", path: ["instruction"] });

export const EditInput = z.object({
  file: z.object({ name: z.string().max(200), content: z.string().min(1) }),
  language: z.string().max(40),
  instruction: Instruction,
});

export const ReviewInput = z.object({
  title: z.string().max(200),
  language: z.string().max(40),
  instructions: z.string().max(20_000),
  files: z.array(z.object({ name: z.string().max(200), content: z.string() })).min(1).max(50),
});

export const FixInput = z.object({
  file: z.object({ name: z.string().max(200), content: z.string().min(1) }),
  language: z.string().max(40),
  issues: z
    .array(
      z.object({
        file: z.string().max(200),
        line: z.number().int().nullable(),
        severity: z.enum(["error", "warning", "suggestion"]),
        message: z.string().max(2000),
        fix: z.string().max(2000),
      }),
    )
    .min(1, "Pick at least one issue to fix.")
    .max(50),
});
