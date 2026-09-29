import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

/**
 * The dashboard's AI helpers: rewriting a note's text and checking a snippet for errors. Two
 * providers, picked by which key is set (JIG_AI_PROVIDER decides when both are):
 * - Gemini (GEMINI_API_KEY): Google's latest Flash, with a free tier; Flash-Lite steps in when
 *   it's busy.
 * - OpenRouter (OPENROUTER_API_KEY): free Gemma models first, then GLM Flash for a fraction of a
 *   cent, sent only to hosts outside China that don't keep prompts.
 * JIG_AI_MODEL overrides the provider's main model. The buttons don't appear without a key. Only
 * what you ask about is sent, and never a locked note or a credential (the callers check).
 */

type Provider = "gemini" | "openrouter";

function provider(): Provider | null {
  const chosen = process.env.JIG_AI_PROVIDER;
  if (chosen === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (chosen === "openrouter" && process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return null;
}

export const aiEnabled = () => provider() !== null;

/** Longest text sent in one go, so a huge note or snippet can't run up a bill or a timeout. */
export const MAX_AI_INPUT = 60_000;

/** An error to show as is: no key, a limit reached, too much text. */
export class AiError extends Error {}

/**
 * `fast` is for rewrites: the lowest thinking level. Gemini 3 thinks at "medium" by default, which
 * spent ~1,300 thinking tokens on a one-paragraph rephrase (7 seconds, and thinking is billed as
 * output); at "low" the same rephrase takes about 2 seconds with none. Reviews keep the model's
 * default, which is what finds real bugs.
 */
async function generate(system: string, prompt: string, json?: object, fast = false): Promise<string> {
  if (prompt.length > MAX_AI_INPUT) throw new AiError("That's too long to send to the AI in one go. Try a shorter part.");
  const which = provider();
  if (!which) throw new AiError("AI isn't set up: add a GEMINI_API_KEY or an OPENROUTER_API_KEY to use it.");
  const text = which === "gemini" ? await geminiGenerate(system, prompt, json, fast) : await openRouterGenerate(system, prompt, json);
  if (!text) throw new AiError("The AI didn't return anything. Try again.");
  return text;
}

// --- Gemini ---

/**
 * The models to try, in order. When Google's servers are busy (503) or a free-tier limit is hit
 * (429), the next one gets a go: Flash-Lite is lighter, answers in about a second, and is far less
 * often overloaded.
 */
const GEMINI_MODELS = () => [...new Set([process.env.JIG_AI_MODEL || "gemini-flash-latest", "gemini-flash-lite-latest"])];

let client: GoogleGenAI | undefined;
function gemini() {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

async function geminiGenerate(system: string, prompt: string, json: object | undefined, fast: boolean): Promise<string | undefined> {
  const models = GEMINI_MODELS();
  for (const [i, model] of models.entries()) {
    const ask = (low: boolean) =>
      gemini().models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          ...(json ? { responseMimeType: "application/json", responseJsonSchema: json } : {}),
          // thinkingLevel is how Gemini 3 models take it (thinkingBudget is the older, 2.5-era setting).
          ...(low ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        },
      });
    try {
      // A model that doesn't take thinking levels (an older one set in JIG_AI_MODEL) is asked plainly.
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

/** Turns a failed Gemini request into a message worth showing. */
function geminiError(error: unknown): AiError {
  if (error instanceof ApiError) {
    if (error.status === 429) return new AiError("The AI's free limit is used up for now. Try again in a minute.");
    // A key in a Google project with prepaid billing and no credit left (billing turns the free tier off).
    if (error.status === 402) {
      return new AiError("The Gemini key's Google project is out of prepaid credit. Add credit in AI Studio, or use a key from a project without billing (free tier).");
    }
    if (error.status === 503) return new AiError("Gemini is busy right now. Try again in a moment.");
    if (error.status === 400 || error.status === 403) return new AiError("Gemini turned the request down. Check that GEMINI_API_KEY is valid.");
  }
  console.error("AI request failed:", error);
  return new AiError("The AI couldn't answer just now. Try again.");
}

// --- OpenRouter ---

/**
 * Tried in order; OpenRouter moves to the next by itself when one is rate-limited or down. Free
 * Gemma first (free models share one pool across all of OpenRouter, so they're often throttled),
 * then GLM Flash, which costs a fraction of a cent and is there when both free ones are busy.
 * Needs a little credit on the account to reach it. JIG_AI_MODEL goes first when set.
 */
const OPENROUTER_MODELS = () =>
  [...new Set([process.env.JIG_AI_MODEL, "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "~z-ai/glm-flash-latest"])].filter(
    (m): m is string => Boolean(m),
  ).slice(0, 3);

/**
 * Hosts to skip: the model makers' own servers and other hosts in China, where prompts would fall
 * under Chinese data law. The same models run on US and EU hosts.
 */
const CHINA_HOSTS = ["z-ai", "deepseek", "moonshotai", "siliconflow", "streamlake", "baidu", "alibaba"];

type OpenRouterReply = {
  choices?: { message?: { content?: string | null } }[];
  error?: { code?: number; message?: string };
};

async function openRouterGenerate(system: string, prompt: string, json?: object): Promise<string | undefined> {
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Jig",
      },
      body: JSON.stringify({
        models: OPENROUTER_MODELS(),
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        ...(json ? { response_format: { type: "json_schema", json_schema: { name: "result", schema: json } } } : {}),
        // Only hosts that don't store prompts or train on them, and none in China.
        provider: { data_collection: "deny", ignore: CHINA_HOSTS },
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    console.error("AI request failed:", error);
    throw new AiError("The AI couldn't answer just now. Try again.");
  }
  const reply = (await response.json().catch(() => ({}))) as OpenRouterReply;
  // OpenRouter reports some failures inside a 200, so check the body as well as the status.
  const status = reply.error?.code ?? (response.ok ? 200 : response.status);
  if (status !== 200) throw openRouterError(status, reply.error?.message);
  return reply.choices?.[0]?.message?.content?.trim();
}

function openRouterError(status: number, message = ""): AiError {
  if (status === 401) return new AiError("OpenRouter didn't accept the key. Check OPENROUTER_API_KEY.");
  if (status === 402) return new AiError("The OpenRouter account is out of credit. Add some at openrouter.ai/settings/credits.");
  if (status === 429) return new AiError("OpenRouter's limit is reached for now. Try again in a minute.");
  if (status === 404) return new AiError("No OpenRouter host can run this model under Jig's privacy rules. Try another model in JIG_AI_MODEL.");
  if (status === 502 || status === 503) return new AiError("The AI is busy right now. Try again in a moment.");
  console.error(`OpenRouter request failed (${status}):`, message);
  return new AiError("The AI couldn't answer just now. Try again.");
}

export type RewriteMode = "rephrase" | "shorten" | "fix";

const REWRITE: Record<RewriteMode, string> = {
  rephrase: "Rephrase it so it reads clearly and naturally. Keep the meaning, facts and level of detail.",
  shorten: "Make it shorter and tighter. Keep every fact, step, name, number and link; cut only repetition and filler.",
  fix: "Fix spelling, grammar and punctuation only. Change nothing else: not the wording, tone or structure.",
};

/** Rewrites some of a note's text. Takes and returns markdown. */
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

/** Models sometimes wrap the whole answer in a ```markdown fence despite being asked not to. */
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

/** The shape the model is held to, as JSON Schema (without `$schema`, which OpenAI-style APIs reject). */
const { $schema: _, ...REVIEW_JSON } = z.toJSONSchema(ReviewSchema);

/** Looks for bugs and mistakes in a snippet's files. Lines are numbered so issues can point at them. */
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
    // Some models wrap JSON in a code fence or a sentence; take the object itself.
    parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    throw new AiError("The AI's answer came back garbled. Try again.");
  }
  const result = ReviewSchema.safeParse(parsed);
  if (!result.success) throw new AiError("The AI's answer came back garbled. Try again.");
  return result.data;
}

/**
 * Applies chosen review issues to one file and returns the whole file, fixed. Asked to change
 * nothing else, so the diff the editor shows stays about the fixes.
 */
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
  // Strip a fence of any language the model may have wrapped the file in anyway.
  const fenced = fixed.match(/^```[\w-]*\n([\s\S]*)\n```$/);
  const body = fenced ? fenced[1] : fixed;
  // Answers come back trimmed; keep the file's own final newline so it doesn't show as a change.
  return file.content.endsWith("\n") && !body.endsWith("\n") ? `${body}\n` : body;
}
