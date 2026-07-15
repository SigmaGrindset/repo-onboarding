import { NextResponse } from "next/server";
import { getAnalysisCached } from "@/lib/datasource";
import { renderOnboardingMarkdown } from "@/lib/exportMarkdown";

/**
 * GET /api/analyses/[id]/markdown — download a committable `ONBOARDING.md`.
 *
 * Renders the analysis document through the web-side Markdown mirror
 * (`@/lib/exportMarkdown`) and serves it as an attachment. Access control is
 * already enforced by `getAnalysisCached` → the resolved data source: share
 * tokens (`st_`), cloud db ids (`db_`, via `canReadAnalysis`) and fixture ids
 * are all handled there, so this route needs no auth code of its own. An
 * unresolved id returns 404, matching the sibling route's error shape.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const analysis = await getAnalysisCached(id);
  if (!analysis) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return new Response(renderOnboardingMarkdown(analysis), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ONBOARDING.md"',
    },
  });
}
