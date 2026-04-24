import { createHash } from "node:crypto";
import { CHAT_CACHE_MAX_KEYS, CHAT_CACHE_TTL_MS } from "./config.js";

export const responseCache = new Map();

export function cacheKey(model, language, question, rich) {
  const q = question.trim().toLowerCase();
  return createHash("sha256")
    .update(`${model}|${language}|${rich ? "1" : "0"}|${q}`)
    .digest("hex");
}

export function cacheGet(key) {
  if (CHAT_CACHE_TTL_MS <= 0) return null;
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    responseCache.delete(key);
    return null;
  }
  return hit.payload;
}

export function cacheSet(key, payload) {
  if (CHAT_CACHE_TTL_MS <= 0) return;
  while (responseCache.size >= CHAT_CACHE_MAX_KEYS) {
    const first = responseCache.keys().next().value;
    responseCache.delete(first);
  }
  responseCache.set(key, { exp: Date.now() + CHAT_CACHE_TTL_MS, payload });
}
