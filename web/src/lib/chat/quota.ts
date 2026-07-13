/**
 * Per-user daily chat quota (cloud mode).
 *
 * Server-only: imports the Neon client, so this module is only ever pulled in
 * via a lazy `await import()` from a cloud-mode route handler.
 *
 * Atomicity: the Neon HTTP driver has no interactive transactions, so the
 * check-and-increment must be a single statement to be race-free. We INSERT a
 * fresh (userId, day) row with count 1, and on conflict conditionally bump the
 * count — but only `setWhere count < limit`. Postgres evaluates that predicate
 * inside the same statement, so concurrent requests can never both slip past
 * the limit. The `.returning()` clause is the signal: when the conditional
 * update is skipped (user is at/over quota), no row comes back, so an empty
 * result means "denied". A returned row means the increment succeeded and its
 * `count` is the new usage.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/db/db";
import { chatQuota } from "@/db/schema";

/** UTC calendar day as "YYYY-MM-DD" — the quota bucket key. */
export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Atomically consume one message from `userId`'s allowance for the current UTC
 * day. Returns `{ allowed, used }`: `allowed` is false when the user is already
 * at `limit`, and `used` is the post-increment count (or `limit` when denied).
 */
export async function consumeChatQuota(
  userId: string,
  limit: number,
): Promise<{ allowed: boolean; used: number }> {
  if (limit <= 0) return { allowed: false, used: 0 };
  const rows = await getDb()
    .insert(chatQuota)
    .values({ userId, day: utcDayKey(), count: 1 })
    .onConflictDoUpdate({
      target: [chatQuota.userId, chatQuota.day],
      set: { count: sql`${chatQuota.count} + 1`, updatedAt: sql`now()` },
      setWhere: sql`${chatQuota.count} < ${limit}`,
    })
    .returning({ count: chatQuota.count });
  return rows.length > 0
    ? { allowed: true, used: rows[0].count }
    : { allowed: false, used: limit };
}
