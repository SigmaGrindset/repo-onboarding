/**
 * Chat feature configuration — resolved entirely from environment variables.
 *
 * Intentionally dependency-free (only reads `process.env`) so it is safe to
 * import from anywhere: server components, route handlers, and client bundles
 * that only need `isChatEnabled()` / `chatModelId()` to decide what to render.
 * The AI Gateway key is the single on/off switch for the whole feature.
 */

/** True when the AI Gateway key is configured, i.e. chat is available at all. */
export function isChatEnabled(): boolean {
  return !!process.env.AI_GATEWAY_API_KEY?.trim();
}

/**
 * The AI Gateway model id (a plain "provider/model" string). Falls back to a
 * sensible default when `CHAT_MODEL` is unset or blank.
 */
export function chatModelId(): string {
  return process.env.CHAT_MODEL?.trim() || "google/gemini-3-flash";
}

/**
 * Per-user daily message allowance (cloud mode). Parsed from
 * `CHAT_DAILY_MESSAGE_LIMIT`; defaults to 30 when unset or unparseable and is
 * clamped to the inclusive range [1, 1000] so a bad value can never disable
 * chat entirely or open an unbounded quota.
 */
export function chatDailyLimit(): number {
  const raw = process.env.CHAT_DAILY_MESSAGE_LIMIT?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return 30;
  return Math.min(1000, Math.max(1, n));
}
