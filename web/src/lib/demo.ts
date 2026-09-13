/**
 * The public example analysis.
 *
 * In cloud mode every analysis belongs to its owner and the people they share
 * it with, so a signed-out visitor has nothing to look at. This one fixture — a
 * real analysis of a public repository, read from `data/<id>/analysis.json` —
 * is the exception: the proxy lets anyone open it, and the home page offers it
 * to signed-out visitors. The file ships with the deployment because
 * `next.config.ts` traces it into the server bundle.
 *
 * A pure module with zero imports, so the proxy can use it without pulling the
 * data layer into its bundle.
 */

export const DEMO_ANALYSIS_ID = "epic-stack";

/** True when `id` is the public demo — an exact match, never a prefix. */
export function isDemoAnalysis(id: string): boolean {
  return id === DEMO_ANALYSIS_ID;
}

const escapedId = DEMO_ANALYSIS_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * What the proxy serves without sign-in for the demo: every page under the
 * analysis (sections, OG image) and its Markdown download. The chat and
 * progress APIs are deliberately absent — they need an account, and the
 * analysis layout hides the chat launcher from signed-out visitors to match.
 */
export const DEMO_PUBLIC_ROUTES: RegExp[] = [
  new RegExp(`^/analysis/${escapedId}(?:/.*)?$`),
  new RegExp(`^/api/analyses/${escapedId}/markdown$`),
];
