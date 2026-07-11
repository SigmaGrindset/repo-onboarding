// Server-only module: importing node:fs keeps it out of client bundles.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Analysis } from "@schema/analysis";

/**
 * Narrow data-source interface. WP4 will provide a Clerk/Neon/Blob-backed
 * implementation behind this same contract; the UI only ever talks to this.
 */
export interface DataSource {
  listAnalyses(): Promise<AnalysisSummary[]>;
  getAnalysis(id: string): Promise<Analysis | null>;
}

/** Lightweight card-level view of an analysis for the index page. */
export interface AnalysisSummary {
  id: string;
  repoName: string;
  repoUrl: string | null;
  primaryLanguage: string;
  totalFiles: number;
  totalLoc: number;
  analyzedAt: string;
  summary: string;
}

/**
 * Absolute path to the repo-root `data/` directory. In dev, build and start,
 * `process.cwd()` is the `web/` directory, so the fixtures live one level up.
 * Built with path.join so it is correct on Windows.
 */
const DATA_DIR = path.join(process.cwd(), "..", "data");

/** A directory id is a single path segment: letters, digits, dash, underscore, dot. */
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(id) && id !== "." && id !== "..";
}

async function readAnalysisFile(id: string): Promise<Analysis | null> {
  const file = path.join(DATA_DIR, id, "analysis.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as Analysis;
  } catch {
    return null;
  }
}

function toSummary(id: string, a: Analysis): AnalysisSummary {
  return {
    id,
    repoName: a.metadata.repoName,
    repoUrl: a.metadata.repoUrl,
    primaryLanguage: a.metadata.primaryLanguage,
    totalFiles: a.metadata.stats.totalFiles,
    totalLoc: a.metadata.stats.totalLoc,
    analyzedAt: a.metadata.analyzedAt,
    summary: a.pitch.summary,
  };
}

/**
 * Filesystem-backed data source. Reads `../data/<id>/analysis.json`.
 * Pure server-side fs — no network, no database, no auth.
 */
export const fsDataSource: DataSource = {
  async listAnalyses(): Promise<AnalysisSummary[]> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    } catch {
      return [];
    }

    const dirs = entries
      .filter((e) => e.isDirectory() && isSafeId(e.name))
      .map((e) => e.name);

    const summaries = await Promise.all(
      dirs.map(async (id) => {
        const analysis = await readAnalysisFile(id);
        return analysis ? toSummary(id, analysis) : null;
      }),
    );

    return summaries
      .filter((s): s is AnalysisSummary => s !== null)
      .sort((a, b) => a.repoName.localeCompare(b.repoName));
  },

  async getAnalysis(id: string): Promise<Analysis | null> {
    if (!isSafeId(id)) return null;
    return readAnalysisFile(id);
  },
};

import { isCloudMode } from "./mode";

/**
 * Pick the data source for the active mode. Cloud mode is loaded via dynamic
 * import so its Clerk/DB/Blob dependencies are NEVER evaluated in local mode.
 *
 * Every page and API route obtains its data source through this function, so
 * the mode switch and (in cloud mode) the per-user access checks are enforced
 * uniformly. In cloud mode the source still delegates fixture ids to the fs
 * source, so demo analyses stay viewable.
 */
export async function resolveDataSource(): Promise<DataSource> {
  if (isCloudMode()) {
    const { cloudDataSource } = await import("./cloud-datasource");
    return cloudDataSource;
  }
  return fsDataSource;
}

/**
 * Back-compat alias — the fs source. Prefer `resolveDataSource()` in pages so
 * cloud mode is honored. Kept so any direct fixture reads keep working.
 */
export const dataSource: DataSource = fsDataSource;
