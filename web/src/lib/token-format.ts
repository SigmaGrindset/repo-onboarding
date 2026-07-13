/**
 * Personal API token format — the pure, database-free half of the token model.
 *
 * A token is the string `roa_` followed by 40 lowercase hex characters
 * (20 random bytes). This module owns everything about that string shape:
 * generating one, validating its syntax, hashing it for storage, and deriving
 * the short display prefix. It imports only `node:crypto`, so it is safe to
 * unit-test with no database and safe to import from anywhere.
 *
 * The stored/DB-touching operations (create / list / revoke / resolve) live in
 * the sibling `@/lib/tokens` module, which builds on these helpers.
 *
 * SECURITY: only the SHA-256 hash of a token is ever persisted. The plaintext
 * `roa_…` value is returned to the caller exactly once (at creation) and is
 * unrecoverable afterward.
 */

import { createHash, randomBytes } from "node:crypto";

/** Fixed scheme prefix on every token (also the display-prefix's first chars). */
export const TOKEN_PREFIX = "roa_";

/** Number of random bytes in a token body (→ 40 hex chars). */
const TOKEN_BYTES = 20;

/** Length of the short, non-secret display prefix (`roa_` + 8 hex = 12). */
export const TOKEN_DISPLAY_PREFIX_LEN = 12;

/** Canonical token syntax: `roa_` + exactly 40 lowercase hex chars. */
export const TOKEN_RE = /^roa_[0-9a-f]{40}$/;

/** Max length of a user-chosen token name (after trimming). */
export const TOKEN_NAME_MAX_LEN = 60;

/** Generate a fresh plaintext token. Cryptographically random; never stored. */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("hex");
}

/** True iff `token` is exactly the canonical `roa_…` shape. */
export function isValidTokenFormat(token: string): boolean {
  return TOKEN_RE.test(token);
}

/** SHA-256 hex digest of a plaintext token — the only stored form of the secret. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The first 12 chars (`roa_xxxxxxxx`) of a token, kept for display only. */
export function tokenDisplayPrefix(token: string): string {
  return token.slice(0, TOKEN_DISPLAY_PREFIX_LEN);
}

/**
 * Pull the bearer token out of an `Authorization` header value (or a raw token
 * string) and return it only if it is syntactically valid; otherwise null.
 *
 * Accepts `Bearer roa_…` (scheme case-insensitive, one space) as well as a bare
 * `roa_…` value. Anything else — missing header, wrong scheme, garbage — is
 * null, so callers never hash or query a malformed value.
 */
export function parseBearerToken(
  authorization: string | null | undefined,
): string | null {
  if (!authorization) return null;
  const raw = authorization.trim();
  if (!raw) return null;

  let candidate = raw;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  if (match) {
    candidate = match[1].trim();
  } else if (/\s/.test(raw)) {
    // Has a scheme-like prefix that isn't Bearer (e.g. "Basic …"): reject.
    return null;
  }

  return isValidTokenFormat(candidate) ? candidate : null;
}

/**
 * Normalize a user-supplied token name: trim, enforce non-empty and a max
 * length. Returns the cleaned name, or null when it is empty after trimming.
 */
export function normalizeTokenName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, TOKEN_NAME_MAX_LEN);
}
