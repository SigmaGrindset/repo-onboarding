/**
 * System-prompt builder for the "Ask this repo" chat.
 *
 * Pure module — the only import is the `Analysis` *type* — so it stays out of
 * server-only bundles and is trivially unit-testable. It turns an analysis
 * document into the grounding system prompt and caps conversation history.
 */

import type { Analysis } from "@schema/analysis";
import { parseGitHubRepo } from "@/lib/github";

/** Maximum number of recent turns to keep when sending history to the model. */
export const MAX_HISTORY_MESSAGES = 12;

/**
 * Build the grounding system prompt for a given analysis. The model is framed
 * as an onboarding buddy for the repo, told to ground every answer in the
 * embedded analysis document, and — only when source files are reachable on
 * GitHub at the analyzed commit — told it may call the `fetchFile` tool.
 */
export function buildSystemPrompt(analysis: Analysis): string {
  const { metadata } = analysis;
  const repoName = metadata.repoName;

  const sourceAvailable =
    parseGitHubRepo(metadata.repoUrl) !== null &&
    typeof metadata.commitSha === "string" &&
    metadata.commitSha.trim().length > 0;

  const toolLine = sourceAvailable
    ? "You may call the `fetchFile` tool to read actual source files from the repository at the analyzed commit when a question needs source-level detail the analysis document does not spell out. Use it sparingly — at most 4 times per reply — and only for files the analysis references."
    : "Source files are not available in this session; answer from the analysis document only.";

  return [
    `You are an onboarding buddy for the "${repoName}" codebase. Your job is to help a developer who is new to this repository get productive quickly — explaining how things fit together, where to look, and why.`,
    "",
    "Rules:",
    "- Ground every answer in the analysis document below. Do not rely on outside knowledge of the repository.",
    "- Cite concrete file paths in backticks (e.g. `src/index.ts`) whenever you point at code.",
    "- Prefer pointing the reader at the guided tour steps and codebase map entries when they are relevant.",
    "- If the analysis document does not answer the question and no tool can retrieve the answer, say plainly that you don't know. Never invent files, APIs, functions, or behavior.",
    "- Answer in concise markdown.",
    `- ${toolLine}`,
    "",
    "The analysis document:",
    "```json",
    JSON.stringify(analysis),
    "```",
  ].join("\n");
}

/**
 * Keep only the last `max` messages. Arrays at or under the cap pass through
 * unchanged (a new array is still returned for consistency).
 */
export function capMessages<T>(messages: T[], max = MAX_HISTORY_MESSAGES): T[] {
  if (messages.length <= max) return messages.slice();
  return messages.slice(messages.length - max);
}
