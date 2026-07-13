/**
 * Personal API tokens — persistence and authentication (cloud mode only).
 *
 * This is the ONE place token rows are created, listed, revoked, and resolved.
 * It is deliberately separate from `@/lib/access`: a token AUTHENTICATES a user
 * (proves "you are this Clerk id"), whereas `access.ts` AUTHORIZES a specific
 * analysis read. Keep the concerns apart — token code never joins on analysis
 * tables, and access code never touches `api_tokens`.
 *
 * The pure format helpers (generate / validate / hash / prefix / header parse)
 * live in `@/lib/token-format` so they are unit-testable without a database.
 *
 * SECURITY MODEL: only `sha256(plaintext)` is stored. `createToken` returns the
 * plaintext once; it is unrecoverable after. `resolveTokenUser` hashes the
 * presented token and looks it up by the unique hash index — a constant-shape
 * query that never leaks which part of a token was wrong. Revocation is a hard
 * delete, so a revoked token can never re-resolve.
 *
 * Server-only: imports the Neon client. Only reachable in cloud mode.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/db";
import { apiTokens } from "@/db/schema";
import {
  generateToken,
  hashToken,
  normalizeTokenName,
  parseBearerToken,
  tokenDisplayPrefix,
} from "@/lib/token-format";

/** A token as shown in listings — never includes the hash or the plaintext. */
export interface TokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** The one-time result of creating a token; `token` is the plaintext secret. */
export interface CreatedToken {
  id: string;
  name: string;
  /** Plaintext `roa_…` — shown once, never stored, unrecoverable after this. */
  token: string;
  tokenPrefix: string;
  createdAt: Date;
}

/**
 * Create a new named token for `userId`. Generates the plaintext, stores only
 * its hash + display prefix, and returns the plaintext exactly once.
 *
 * Throws on an empty/whitespace `name` (callers should validate first for a
 * friendly 400, but this is a backstop).
 */
export async function createToken(
  userId: string,
  name: string,
): Promise<CreatedToken> {
  const cleanName = normalizeTokenName(name);
  if (!cleanName) {
    throw new Error("Token name is required.");
  }

  const token = generateToken();
  const id = crypto.randomUUID();
  const tokenPrefix = tokenDisplayPrefix(token);

  const rows = await getDb()
    .insert(apiTokens)
    .values({
      id,
      userId,
      name: cleanName,
      tokenHash: hashToken(token),
      tokenPrefix,
    })
    .returning({ createdAt: apiTokens.createdAt });

  return {
    id,
    name: cleanName,
    token,
    tokenPrefix,
    createdAt: rows[0]?.createdAt ?? new Date(),
  };
}

/** List `userId`'s tokens (newest first), without any hash or plaintext. */
export async function listTokens(userId: string): Promise<TokenSummary[]> {
  if (!userId) return [];
  const rows = await getDb()
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Revoke (hard-delete) token `tokenId`, but only if it belongs to `userId`.
 * Returns true when a row was deleted, false when nothing matched (wrong owner
 * or already gone) — callers map false to a 404.
 */
export async function revokeToken(
  userId: string,
  tokenId: string,
): Promise<boolean> {
  if (!userId || !tokenId) return false;
  const deleted = await getDb()
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });
  return deleted.length > 0;
}

/**
 * Authenticate a request from its `Authorization` header (or a raw token).
 * Returns the owning Clerk user id, or null when the token is malformed,
 * unknown, or revoked.
 *
 * On a successful match, `last_used_at` is bumped fire-and-forget: the update
 * is NOT awaited on the hot path and any failure is swallowed, so a slow or
 * failing write can never break authentication or slow the upload.
 */
export async function resolveTokenUser(
  authorizationOrToken: string | null | undefined,
): Promise<string | null> {
  const token = parseBearerToken(authorizationOrToken);
  if (!token) return null;

  const hash = hashToken(token);
  const rows = await getDb()
    .select({ id: apiTokens.id, userId: apiTokens.userId })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Fire-and-forget last-used bump; never block or fail auth on it.
  void touchLastUsed(row.id);

  return row.userId;
}

/** Best-effort `last_used_at` bump. Errors are intentionally swallowed. */
async function touchLastUsed(tokenId: string): Promise<void> {
  try {
    await getDb()
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, tokenId));
  } catch {
    // Non-fatal: last-used is a nicety, not part of the auth decision.
  }
}
