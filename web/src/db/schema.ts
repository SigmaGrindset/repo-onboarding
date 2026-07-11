/**
 * Drizzle schema — the cloud-mode data model.
 *
 * Two tables, designed so that sharing lands later with zero rework:
 *
 *  - `analyses`        — one row per uploaded analysis.json (metadata only; the
 *                        payload itself lives in Vercel Blob at `blob_key`).
 *  - `analysis_access` — the authorization table. Every read of a user-uploaded
 *                        analysis is gated by a row here. Today every upload
 *                        writes exactly one row with role 'owner'; a future
 *                        "share" feature just inserts more rows with role
 *                        'viewer' and the existing read paths pick them up
 *                        automatically.
 *
 * `analyses.id` is stored as text (an app-generated v4 UUID) so no Postgres
 * uuid extension is required.
 */

import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const analyses = pgTable("analyses", {
  /** App-generated v4 UUID (stored as text). */
  id: text("id").primaryKey(),
  /** Clerk user id of the uploader. */
  ownerId: text("owner_id").notNull(),
  repoName: text("repo_name").notNull(),
  /** Canonical remote URL, or null for a local-only path. */
  repoUrl: text("repo_url"),
  /** Vercel Blob pathname holding the analysis.json payload. */
  blobKey: text("blob_key").notNull(),
  /** Short elevator-pitch summary, denormalized for cheap index cards. */
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const analysisAccess = pgTable(
  "analysis_access",
  {
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    /** 'owner' | 'viewer'. Owner-only today; viewer rows are future sharing. */
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.analysisId, t.userId] })],
);

export type AnalysisRow = typeof analyses.$inferSelect;
export type AnalysisAccessRow = typeof analysisAccess.$inferSelect;
