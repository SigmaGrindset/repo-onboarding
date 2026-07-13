/**
 * "Ask this repo" chat transcript persistence in localStorage — one key per
 * analysis route id (fixtures, `db_` cloud ids and `st_` share ids all share
 * this client-only store; there is no server-side chat history).
 *
 * The transcript is capped two ways before writing so a runaway conversation
 * can never blow the ~5 MB origin quota: by message count, then by serialized
 * byte size (long tool outputs / code blocks dominate the size, so a count cap
 * alone is not enough). `capStoredMessages` is pure and unit-tested.
 *
 * Safe to import anywhere: this module only touches `localStorage`, and every
 * access is wrapped in try/catch so SSR, private browsing and disabled storage
 * all degrade to session-only behavior (like `tour-progress-local`).
 */

import type { UIMessage } from "ai"; // type-only — nothing from `ai` at runtime

const KEY_PREFIX = "chat-history:";

/** Keep at most this many of the most recent messages. */
export const MAX_STORED_MESSAGES = 50;

/** Then drop from the front until the serialized transcript fits this budget. */
export const MAX_STORED_BYTES = 200_000;

function storageKey(analysisId: string): string {
  return `${KEY_PREFIX}${analysisId}`;
}

/**
 * Cap a transcript for storage. First keeps the last `MAX_STORED_MESSAGES`;
 * then, while the JSON of the result exceeds `MAX_STORED_BYTES` and more than
 * one message remains, drops the oldest message. A single message whose JSON
 * alone exceeds the byte budget is still returned (as the sole element) rather
 * than dropped — losing the newest turn would be worse than a slightly oversize
 * write, and the write itself is guarded, so an over-quota `setItem` simply
 * no-ops. Pure: never mutates its argument.
 */
export function capStoredMessages(messages: UIMessage[]): UIMessage[] {
  let result = messages.slice(-MAX_STORED_MESSAGES);
  while (result.length > 1 && JSON.stringify(result).length > MAX_STORED_BYTES) {
    result = result.slice(1);
  }
  return result;
}

/**
 * The stored transcript for `analysisId`. Returns `[]` for a missing key, a
 * parse failure, a non-array payload, or any storage error (SSR / disabled).
 */
export function readLocalChatHistory(analysisId: string): UIMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(analysisId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

/** Persist `messages` (already capped by the caller) for `analysisId`. */
export function writeLocalChatHistory(
  analysisId: string,
  messages: UIMessage[],
): void {
  try {
    localStorage.setItem(storageKey(analysisId), JSON.stringify(messages));
  } catch {}
}

/** Forget the stored transcript for `analysisId` (the "New chat" action). */
export function clearLocalChatHistory(analysisId: string): void {
  try {
    localStorage.removeItem(storageKey(analysisId));
  } catch {}
}
