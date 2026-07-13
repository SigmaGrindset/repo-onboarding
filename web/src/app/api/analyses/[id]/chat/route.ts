import { NextResponse } from "next/server";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { isCloudMode } from "@/lib/mode";
import { isChatEnabled, chatModelId, chatDailyLimit } from "@/lib/chat/config";
import { isShareId, isCloudId, uuidFromCloudId } from "@/lib/ids";
import { getAnalysisCached } from "@/lib/datasource";
import { buildSystemPrompt, capMessages } from "@/lib/chat/prompt";
import { createRepoTools } from "@/lib/chat/tools";

/**
 * POST /api/analyses/[id]/chat — streaming "Ask this repo" chat, grounded in the
 * analysis document and (when source is reachable) the repo's files at the
 * analyzed commit. Dual-mode: works in local mode (fixtures, no auth/DB) and in
 * cloud mode (Clerk auth + per-user access + daily quota).
 *
 * Guard ladder, in exact order — every pre-stream failure returns a JSON error:
 *   1. chat configured?           (no AI Gateway key) → 503
 *   2. resolve the route id
 *   3. cloud-mode gate (SKIPPED ENTIRELY in local mode, so no Clerk/DB module is
 *      ever evaluated there — all cloud imports are lazy and live under this
 *      branch): share id → 403; no signed-in user → 401; unknown/forbidden cloud
 *      id → 404/403; over daily quota → 429.
 *   4. parse + validate the message array (only `messages` is read from the
 *      DefaultChatTransport body) → 400
 *   5. load the analysis → 404
 *   6. stream via the AI Gateway.
 *
 * Quota-before-stream: the per-user daily count is consumed once per POST, in
 * step 3, BEFORE any tokens flow. A whole multi-step tool loop is one message,
 * so it costs exactly one count; a failure after the increment burns that one
 * count — accepted, because it errs toward under-serving (abuse-safe), never
 * toward a free unbounded loop. streamText errors surface through the stream's
 * `onError`, so they never crash the route with a 500 after headers are sent.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // streaming + tool round-trips exceed the default

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // 1. Feature gate: the AI Gateway key is the single on/off switch.
  if (!isChatEnabled()) {
    return NextResponse.json(
      { error: "Chat is not configured." },
      { status: 503 },
    );
  }

  // 2. Route id.
  const { id } = await ctx.params;

  // 3. Cloud-mode gate. In local mode NONE of this runs — no Clerk/DB import is
  //    evaluated. `userId` stays null and is only used as an observability tag.
  let userId: string | null = null;
  if (isCloudMode()) {
    // a. Share links are anonymous capabilities; chat requires a real account.
    if (isShareId(id)) {
      return NextResponse.json(
        { error: "Sign in to use chat." },
        { status: 403 },
      );
    }

    // b. Authenticate (proxy already blocks anonymous /api/* — defense in depth).
    const { auth } = await import("@clerk/nextjs/server");
    const { userId: authUserId } = await auth();
    if (!authUserId) {
      return NextResponse.json({ error: "Sign in." }, { status: 401 });
    }
    userId = authUserId;

    // c. Access check for DB-backed analyses. Plain fixture ids in cloud mode
    //    are unguarded, matching the cloud data source.
    if (isCloudId(id)) {
      const uuid = uuidFromCloudId(id);
      if (!uuid) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      const { canReadAnalysis } = await import("@/lib/access");
      if (!(await canReadAnalysis(userId, uuid))) {
        return NextResponse.json(
          { error: "You do not have access to this analysis." },
          { status: 403 },
        );
      }
    }

    // d. Consume one message from the daily allowance, before streaming.
    const { consumeChatQuota } = await import("@/lib/chat/quota");
    const limit = chatDailyLimit();
    const { allowed, used } = await consumeChatQuota(userId, limit);
    if (!allowed) {
      return NextResponse.json(
        {
          error: `Daily chat limit reached (${limit}/day). Resets at midnight UTC.`,
          used,
          limit,
        },
        { status: 429 },
      );
    }
  }

  // 4. Parse + validate the body. The client transport sends
  //    { id, messages, trigger, messageId }; we only read `messages`.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body is not valid JSON." },
      { status: 400 },
    );
  }
  const messages = (body as { messages?: unknown })?.messages;
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 100 ||
    (messages[messages.length - 1] as { role?: unknown })?.role !== "user"
  ) {
    return NextResponse.json({ error: "Invalid messages." }, { status: 400 });
  }

  // 5. Load the grounding analysis (works in both modes via the cached source).
  const analysis = await getAnalysisCached(id);
  if (!analysis) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // 6. Stream. Errors from streamText surface through onError as a stream error
  //    part, not a thrown 500.
  const uiMessages = capMessages(messages as UIMessage[]);
  const tools = createRepoTools(analysis);
  const result = streamText({
    model: chatModelId(),
    system: buildSystemPrompt(analysis),
    messages: await convertToModelMessages(uiMessages),
    tools,
    stopWhen: stepCountIs(5),
    maxOutputTokens: 2048,
    // Free-tier gateway rate limits make aggressive retries counterproductive:
    // the default retry burst extends the sliding-window cooldown, so cap at 1.
    maxRetries: 1,
    abortSignal: req.signal,
    providerOptions: {
      gateway: { user: userId ?? "local", tags: ["feature:repo-chat"] },
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error("[chat]", error);
      return "The AI service returned an error. Please try again.";
    },
  });
}
