/**
 * Lazy Neon Postgres client (cloud mode only).
 *
 * Uses the Neon HTTP driver — stateless, serverless-friendly, no connection
 * pooling to manage. The client is created on first use so that importing this
 * module never touches the network and local mode (which never calls `getDb`)
 * pays nothing.
 *
 * NOTE on atomicity: the Neon HTTP driver does not support interactive
 * `db.transaction(...)`. Use `db.batch([...])` for multi-statement atomic
 * writes — Neon runs a batch as a single transaction.
 */

import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Cloud mode requires a Neon Postgres connection string.",
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}
