/**
 * The AI platforms Jig can use for its helpers, as data: adding one is a line here (plus an
 * adapter in lib/ai.ts if it doesn't speak the OpenAI-style API). Shared with the browser, which
 * lists them in the AI settings dialog, so nothing secret belongs here.
 */

export type PlatformId = "gemini" | "anthropic" | "openai" | "openrouter" | "groq" | "mistral" | "deepseek";

export type Platform = {
  id: PlatformId;
  label: string;
  /** How it's called: Google's SDK, Anthropic's SDK, or the OpenAI-style chat completions API. */
  kind: "gemini" | "anthropic" | "openai-compatible";
  /** For the OpenAI-style ones: the API's base address. */
  baseUrl?: string;
  /** Used unless a model is set for the platform. */
  defaultModel: string;
  /** The environment variable that works too (a key saved in the app wins). */
  envKey: string;
  /** Where to make a key. */
  keyUrl: string;
  /** Shown beside the platform: what it's good for, or where the text goes. */
  note: string;
};

export const PLATFORMS: Platform[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "gemini",
    defaultModel: "gemini-flash-latest",
    envKey: "GEMINI_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "Free tier available. On the free tier Google may use prompts to improve its products.",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    defaultModel: "claude-opus-5-5",
    envKey: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
    note: "Paid. Separate from a Claude subscription. Set a model like claude-haiku-4-5 to spend less.",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-6-luna",
    envKey: "OPENAI_API_KEY",
    keyUrl: "https://platform.openai.com/api-keys",
    note: "Paid. Separate from a ChatGPT subscription.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemma-4-31b-it:free",
    envKey: "OPENROUTER_API_KEY",
    keyUrl: "https://openrouter.ai/keys",
    note: "Many models behind one key. Free models first, then a paid one when they're busy. Only hosts outside China that keep no prompts.",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    envKey: "GROQ_API_KEY",
    keyUrl: "https://console.groq.com/keys",
    note: "Very fast. Free tier with rate limits.",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    envKey: "MISTRAL_API_KEY",
    keyUrl: "https://console.mistral.ai/api-keys",
    note: "European company, servers in the EU.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-flash",
    envKey: "DEEPSEEK_API_KEY",
    keyUrl: "https://platform.deepseek.com/api_keys",
    note: "Very cheap. Text is processed and stored in China.",
  },
];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as [PlatformId, ...PlatformId[]];

export function platformById(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === id);
}
