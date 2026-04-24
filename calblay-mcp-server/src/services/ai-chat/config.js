/** Model econòmic per defecte (pots sobreescriure amb OPENAI_MODEL). */
export function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return { apiKey, model };
}

export const TOOL_RESULT_MAX_CHARS = Number(process.env.OPENAI_TOOL_RESULT_MAX_CHARS || 9000);
export const CHAT_CACHE_TTL_MS = Number(process.env.OPENAI_CHAT_CACHE_TTL_MS || 120_000);
export const CHAT_CACHE_MAX_KEYS = Number(process.env.OPENAI_CHAT_CACHE_MAX_KEYS || 200);
export const MAX_TOOL_STEPS = Number(process.env.OPENAI_MAX_TOOL_STEPS || 8);

export const CALBLAY_JSON_MARKER = "```calblay-json";
