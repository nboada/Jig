import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { getDb } from "./db";
import type { Platform } from "./ai-providers";
import { resolveAi, type ResolvedAi } from "./ai-settings";


export const aiEnabled = async () => (await resolveAi(await getDb())) !== null;

export const MAX_AI_INPUT = 60_000;

export class AiError extends Error {}

async function generate(system: string, prompt: string, json?: object, fast = false): Promise<string> {
  if (prompt.length > MAX_AI_INPUT) throw new AiError("That's too long to send to the AI in one go. Try a shorter part.");
  const ai = await resolveAi(await getDb());
  if (!ai) throw new AiError("AI isn't set up: add a key in the ⋯ menu → AI settings.");
  return call(ai, system, prompt, json, fast);
}

async function call(ai: ResolvedAi, system: string, prompt: string, json: object | undefined, fast: boolean): Promise<string> {
  const { platform } = ai;
  const text =
    platform.kind === "gemini"
      ? await geminiGenerate(ai, system, prompt, json, fast)
      : platform.kind === "anthropic"
        ? await anthropicGenerate(ai, system, prompt, json, fast)
        : await chatGenerate(ai, system, prompt, json);
  if (!text) throw new AiError("The AI didn't return anything. Try again.");
  return text;
}

export async function testKey(platform: Platform, apiKey: string, model: string | null): Promise<void> {
  await call({ platform, apiKey, model }, "Reply with the single word: ok", "ok?", undefined, true);
}


const geminiModels = (ai: ResolvedAi) => [...new Set([ai.model || process.env.JIG_AI_MODEL || ai.platform.defaultModel, "gemini-flash-lite-latest"])];

const geminiClients = new Map<string, GoogleGenAI>();
function gemini(apiKey: string) {
  let client = geminiClients.get(apiKey);
  if (!client) geminiClients.set(apiKey, (client = new GoogleGenAI({ apiKey })));
  return client;
}

async function geminiGenerate(ai: ResolvedAi, system: string, prompt: string, json: object | undefined, fast: boolean): Promise<string | undefined> {
  const models = geminiModels(ai);
  for (const [i, model] of models.entries()) {
    const ask = (low: boolean) =>
      gemini(ai.apiKey).models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          ...(json ? { responseMimeType: "application/json", responseJsonSchema: json } : {}),
          ...(low ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        },
      });
    try {
      const response = await ask(fast).catch((error) => {
        if (fast && error instanceof ApiError && error.status === 400) return ask(false);
        throw error;
      });
      return response.text?.trim();
    } catch (error) {
      const busy = error instanceof ApiError && (error.status === 503 || error.status === 429);
      if (busy && i < models.length - 1) continue;
      throw geminiError(error);
    }
  }
}

function geminiError(error: unknown): AiError {
  if (error instanceof ApiError) {
    if (error.status === 429) return new AiError("Gemini's limit is used up for now. Try again in a minute.");
    if (error.status === 402) {
      return new AiError("The Gemini key's Google project is out of prepaid credit. Add credit in AI Studio, or use a key from a project without billing (free tier).");
    }
    if (error.status === 503) return new AiError("Gemini is busy right now. Try again in a moment.");
    if (error.status === 400 || error.status === 401 || error.status === 403) return new AiError("Gemini didn't accept the key. Check it in AI settings.");
    if (error.status === 404) return new AiError("Gemini doesn't know that model. Check the model in AI settings.");
  }
  console.error("AI request failed:", error);
  return new AiError("The AI couldn't answer just now. Try again.");
}


const MODERN_CLAUDE = /^claude-(opus-5|sonnet-5-5|fable-5)/;

async function anthropicGenerate(ai: ResolvedAi, system: string, prompt: string, json: object | undefined, fast: boolean): Promise<string | undefined> {
  const model = ai.model || ai.platform.defaultModel;
  const modern = MODERN_CLAUDE.test(model);
  const client = new Anthropic({ apiKey: ai.apiKey, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: prompt }],
      ...(modern ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: {
        ...(modern ? { effort: fast ? ("low" as const) : ("medium" as const) } : {}),
        ...(json ? { format: { type: "json_schema" as const, schema: json as Record<string, unknown> } } : {}),
      },
    });
    if (response.stop_reason === "refusal") throw new AiError("Claude declined to help with this one.");
    return response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw anthropicError(error);
  }
}

function anthropicError(error: unknown): AiError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiError("Anthropic didn't accept the key. Check it in AI settings.");
  }
  if (error instanceof Anthropic.NotFoundError) return new AiError("Anthropic doesn't know that model. Check the model in AI settings.");
  if (error instanceof Anthropic.RateLimitError) return new AiError("Anthropic's limit is reached for now. Try again in a minute.");
  if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
    return new AiError("The Anthropic account is out of credit. Add some at console.anthropic.com.");
  }
  if (error instanceof Anthropic.APIError && (error.status === 529 || (error.status ?? 0) >= 500)) {
    return new AiError("Claude is busy right now. Try again in a moment.");
  }
  console.error("AI request failed:", error);
  return new AiError("The AI couldn't answer just now. Try again.");
}


const openRouterModels = (first: string | null) =>
  [...new Set([first, "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "~z-ai/glm-flash-latest"])]
    .filter((m): m is string => Boolean(m))
    .slice(0, 3);

const CHINA_HOSTS = ["z-ai", "deepseek", "moonshotai", "siliconflow", "streamlake", "baidu", "alibaba"];

type ChatReply = {
  choices?: { message?: { content?: string | null } }[];
  error?: { code?: number | string; message?: string };
};

async function chatGenerate(ai: ResolvedAi, system: string, prompt: string, json: object | undefined): Promise<string | undefined> {
  const { platform } = ai;
  const openRouter = platform.id === "openrouter";
  const model = ai.model || process.env.JIG_AI_MODEL || platform.defaultModel;
  const send = async (jsonMode: "schema" | "object" | null) => {
    const instructions = jsonMode === "object" ? `${system}\n\nAnswer with only a JSON object matching this JSON Schema:\n${JSON.stringify(json)}` : system;
    const response = await fetch(`${platform.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ai.apiKey}`, "Content-Type": "application/json", ...(openRouter ? { "X-Title": "Jig" } : {}) },
      body: JSON.stringify({
        ...(openRouter ? { models: openRouterModels(ai.model || process.env.JIG_AI_MODEL || null) } : { model }),
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: prompt },
        ],
        ...(jsonMode === "schema" ? { response_format: { type: "json_schema", json_schema: { name: "result", schema: json } } } : {}),
        ...(jsonMode === "object" ? { response_format: { type: "json_object" } } : {}),
        ...(openRouter ? { provider: { data_collection: "deny", ignore: CHINA_HOSTS } } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch((error) => {
      console.error("AI request failed:", error);
      throw new AiError("The AI couldn't answer just now. Try again.");
    });
    const reply = (await response.json().catch(() => ({}))) as ChatReply;
    const status = typeof reply.error?.code === "number" ? reply.error.code : response.ok && !reply.error ? 200 : response.status;
    return { status, reply };
  };
  let { status, reply } = await send(json ? "schema" : null);
  if (json && status === 400) ({ status, reply } = await send("object"));
  if (status !== 200) throw chatError(platform, status, reply.error);
  return reply.choices?.[0]?.message?.content?.trim();
}

function chatError(platform: Platform, status: number, error: ChatReply["error"]): AiError {
  const name = platform.label;
  const message = error?.message ?? "";
  if (status === 401 || status === 403) return new AiError(`${name} didn't accept the key. Check it in AI settings.`);
  if (status === 402 || /insufficient_quota|insufficient balance|credit/i.test(`${error?.code ?? ""} ${message}`)) {
    return new AiError(`The ${name} account is out of credit.`);
  }
  if (status === 429) return new AiError(`${name}'s limit is reached for now. Try again in a minute.`);
  if (status === 404 && platform.id === "openrouter") {
    return new AiError("No OpenRouter host can run this model under Jig's privacy rules. Try another model in AI settings.");
  }
  if (status === 404) return new AiError(`${name} doesn't know that model. Check the model in AI settings.`);
  if (status >= 500) return new AiError(`${name} is busy right now. Try again in a moment.`);
  console.error(`${name} request failed (${status}):`, message);
  return new AiError("The AI couldn't answer just now. Try again.");
}

export type RewriteMode = "rephrase" | "shorten" | "fix";

const REWRITE: Record<RewriteMode, string> = {
  rephrase: "Rephrase it so it reads clearly and naturally. Keep the meaning, facts and level of detail.",
  shorten: "Make it shorter and tighter. Keep every fact, step, name, number and link; cut only repetition and filler.",
  fix: "Fix spelling, grammar and punctuation only. Change nothing else: not the wording, tone or structure.",
};

export async function rewrite(mode: RewriteMode, text: string): Promise<string> {
  const system = [
    "You edit text from the user's personal notes.",
    REWRITE[mode],
    "Write in the same language as the text.",
    "Keep its markdown formatting: headings, lists, checklists, links, inline code and code blocks. Never change what's inside code.",
    "Return only the rewritten text: no introduction, no explanation, no quotes or code fence around it.",
  ].join(" ");
  return stripFence(await generate(system, text, undefined, true));
}

function stripFence(text: string) {
  const fenced = text.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  return fenced ? fenced[1] : text;
}

export type ReviewIssue = {
  file: string;
  line: number | null;
  severity: "error" | "warning" | "suggestion";
  message: string;
  fix: string;
};

export type Review = { summary: string; issues: ReviewIssue[] };

const ReviewSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      file: z.string(),
      line: z.number().int().nullable(),
      severity: z.enum(["error", "warning", "suggestion"]),
      message: z.string(),
      fix: z.string(),
    }),
  ),
});

const { $schema: _, ...REVIEW_JSON } = z.toJSONSchema(ReviewSchema);

export async function review(snippet: {
  title: string;
  language: string;
  instructions: string;
  files: { name: string; content: string }[];
}): Promise<Review> {
  const system = [
    "You review code snippets from a developer's personal library for real problems: bugs, errors that would stop it running, security holes, and mistakes against the stated purpose or instructions.",
    "Report each problem once, with the file and line number where it is, how serious it is, what's wrong and how to fix it.",
    'Use severity "error" for things that break, "warning" for likely bugs or risks, and "suggestion" only for clear improvements. Don\'t pad the list with style preferences.',
    "If nothing is wrong, return no issues and say so in the summary. Keep the summary to one or two sentences.",
  ].join(" ");
  const prompt = [
    `Snippet: ${snippet.title} (${snippet.language})`,
    snippet.instructions ? `Instructions for using it:\n${snippet.instructions}` : "",
    ...snippet.files.map(
      (file) => `File: ${file.name}\n${file.content.split("\n").map((line, i) => `${String(i + 1).padStart(4)} | ${line}`).join("\n")}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
  const raw = await generate(system, prompt, REVIEW_JSON);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    throw new AiError("The AI's answer came back garbled. Try again.");
  }
  const result = ReviewSchema.safeParse(parsed);
  if (!result.success) throw new AiError("The AI's answer came back garbled. Try again.");
  return result.data;
}

export async function fixFile(file: { name: string; content: string }, language: string, issues: ReviewIssue[]): Promise<string> {
  const system = [
    "You fix a file from a developer's snippet library.",
    "Apply exactly the listed fixes and nothing else: keep every other line, comment, name and the formatting as they are.",
    "If a fix is wrong or would break the code, leave that part unchanged.",
    "Return only the complete fixed file: no explanation, and no code fence around it.",
  ].join(" ");
  const prompt = [
    `File: ${file.name} (${language})`,
    "Fixes to apply:",
    ...issues.map((issue, i) => `${i + 1}. ${issue.line ? `Line ${issue.line}: ` : ""}${issue.message} Fix: ${issue.fix}`),
    "File contents:",
    file.content,
  ].join("\n\n");
  const fixed = await generate(system, prompt);
  const fenced = fixed.match(/^```[\w-]*\n([\s\S]*)\n```$/);
  const body = fenced ? fenced[1] : fixed;
  return file.content.endsWith("\n") && !body.endsWith("\n") ? `${body}\n` : body;
}
