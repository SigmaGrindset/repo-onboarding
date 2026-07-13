/**
 * Drizzle schema — the cloud-mode data model.
 *
 * Three tables, designed so that sharing lands later with zero rework:
 *
 *  - `analyses`        — one row per uploaded analysis.json (metadata only; the
 *                        payload itself lives in Vercel Blob at `blob_key`).
 *                        Rows for the same repo are grouped into a lineage
 *                        ("versions") by (`owner_id`, `repo_key`); version
 *                        numbers are NOT stored — they are read-time ordinals
 *                        derived by ordering a lineage's rows by `created_at`.
 *  - `analysis_access` — the authorization table. Every read of a user-uploaded
 *                        analysis is gated by a row here. Today every upload
 *                        writes exactly one row with role 'owner'; a future
 *                        "share" feature just inserts more rows with role
 *                        'viewer' and the existing read paths pick them up
 *                        automatically.
 *  - `tour_progress`   — per-user guided-tour progress (furthest step reached),
 *                        one row per (analysis, user).
 *
 * `analyses.id` is stored as text (an app-generated v4 UUID) so no Postgres
 * uuid extension is required.
 */

import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  index,
  integer,
} from "drizzle-orm/pg-core";

export const analyses = pgTable(
  "analyses",
  {
    /** App-generated v4 UUID (stored as text). */
    id: text("id").primaryKey(),
    /** Clerk user id of the uploader. */
    ownerId: text("owner_id").notNull(),
    repoName: text("repo_name").notNull(),
    /** Canonical remote URL, or null for a local-only path. */
    repoUrl: text("repo_url"),
    /**
     * Stable lineage key (see `@/lib/repo-key`). Groups a repo's analyses into
     * versions via (`owner_id`, `repo_key`). Defaults to '' for rows written
     * before the column existed; migration 0002 backfills those.
     */
    repoKey: text("repo_key").notNull().default(""),
    /** Vercel Blob pathname holding the analysis.json payload. */
    blobKey: text("blob_key").notNull(),
    /** Short elevator-pitch summary, denormalized for cheap index cards. */
    summary: text("summary").notNull(),
    /** Analyzed commit SHA, denormalized from `metadata.commitSha`. Nullable. */
    commitSha: text("commit_sha"),
    /**
     * When the analysis was produced, denormalized from `metadata.analyzedAt`.
     * Nullable — null for pre-migration rows that predate this column.
     */
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    /**
     * Unlisted-link share token (a v4 UUID stored as text). When set, anyone with
     * the URL `/analysis/st_<share_token>` can view without signing in. Null means
     * link sharing is off; unique so a token maps to at most one analysis.
     */
    shareToken: text("share_token").unique(),
    /**
     * Total guided-tour step count, denormalized from `tour.length` at upload so
     * index cards can show "n steps" without fetching the Blob payload. 0 for
     * rows written before the column existed (their badge is simply hidden).
     */
    tourSteps: integer("tour_steps").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Serves the lineage query in `listVersionsFor`: filter by owner + repoKey,
    // ordered by createdAt.
    index("analyses_owner_repo_key_created_at_idx").on(
      t.ownerId,
      t.repoKey,
      t.createdAt,
    ),
  ],
);

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

/**
 * Per-user guided-tour progress, keyed per analysis *version* (a new upload has
 * a new tour, so progress starts fresh). `furthest_step` is the highest 1-based
 * step the user has visited; writes only ever raise it (GREATEST upsert in
 * `@/lib/tour-progress`).
 */
export const tourProgress = pgTable(
  "tour_progress",
  {
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    furthestStep: integer("furthest_step").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.analysisId, t.userId] })],
);

export type AnalysisRow = typeof analyses.$inferSelect;
export type AnalysisAccessRow = typeof analysisAccess.$inferSelect;
export type TourProgressRow = typeof tourProgress.$inferSelect;
