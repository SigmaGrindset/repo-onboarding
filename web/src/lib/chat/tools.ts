/**
 * AI SDK tool wiring for the "Ask this repo" chat.
 *
 * Exposes a single `fetchFile` tool that lets the model read real source files
 * from the analyzed repository at the analyzed commit. A fresh `ToolSet` is
 * built per request (`createRepoTools`), and the per-call fetch budget lives in
 * a closure over that ToolSet — so the "max 4 files per reply" cap is enforced
 * per request, not globally. The tool is only offered when the analysis has a
 * parseable GitHub `repoUrl` and a non-blank `commitSha`; otherwise there is no
 * source to reach and the whole ToolSet is omitted (matching the system
 * prompt, which only advertises the tool under the same condition).
 *
 * `execute` NEVER throws: every failure (budget exhausted, bad path, network,
 * 404, binary, oversize) is returned as tagged tool output so the model can
 * recover and answer with what it already has.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Analysis } from "@schema/analysis";
import { parseGitHubRepo } from "@/lib/github";
import {
  fetchRepoFileAtSha,
  sanitizeRepoPath,
  MAX_FETCHES_PER_REQUEST,
} from "@/lib/chat/github-file";

/**
 * Build the per-request tool set for an analysis. Returns `{ fetchFile }` when
 * the analysis metadata carries a GitHub `repoUrl` and a non-empty `commitSha`,
 * else `undefined` (no reachable source, so no tools).
 */
export function createRepoTools(analysis: Analysis): ToolSet | undefined {
  const { metadata } = analysis;
  const gh = parseGitHubRepo(metadata.repoUrl);
  const sha =
    typeof metadata.commitSha === "string" ? metadata.commitSha.trim() : "";
  if (!gh || sha.length === 0) return undefined;

  const { owner, repo } = gh;

  // Per-CALL budget: a new ToolSet (and thus a new counter) is created for each
  // request, so this closure is effectively a per-request fetch allowance.
  let fetchesUsed = 0;

  const fetchFile = tool({
    description:
      "Fetch a source file from the analyzed repository at the analyzed commit. Use only for questions the analysis document cannot answer. Max 4 files per reply.",
    inputSchema: z.object({
      path: z
        .string()
        .describe("Repo-relative file path, e.g. src/lib/mode.ts"),
    }),
    execute: async ({ path }) => {
      if (fetchesUsed >= MAX_FETCHES_PER_REQUEST) {
        return {
          ok: false as const,
          error:
            "File fetch budget exhausted for this reply. Answer with what you already have.",
        };
      }

      const clean = sanitizeRepoPath(path);
      if (clean === null) {
        return { ok: false as const, error: "Invalid file path." };
      }

      fetchesUsed += 1;
      return fetchRepoFileAtSha({
        owner,
        repo,
        sha,
        path: clean,
        token: process.env.GITHUB_TOKEN || undefined,
      });
    },
  });

  return { fetchFile };
}
