import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type {
  ArchitectureDelta,
  GraphEdgeDelta,
  GraphNodeDelta,
  HotspotDelta,
} from "@/lib/diff";
import { diffAnalyses } from "@/lib/diff";
import { getAnalysisCached } from "@/lib/datasource";
import { repoKeyFor } from "@/lib/repo-key";
import { parseGitHubRepo } from "@/lib/github";
import { formatDate, formatNumber, shortSha } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import {
  activityStyle,
  diffKindStyle,
  kindStyle,
  type DiffKind,
} from "@/lib/styles";
import { Badge, Card, EmptyState, SectionHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/* -- small presentation helpers ---------------------------------------- */

/** "+12" | "-3" | "0" for a signed integer delta. */
function signed(n: number): string {
  return n > 0 ? `+${formatNumber(n)}` : n < 0 ? `-${formatNumber(-n)}` : "0";
}

/** Literal colour classes for a signed delta (emerald up, rose down, muted zero). */
function deltaClass(n: number): string {
  return n > 0
    ? "text-emerald-600 dark:text-emerald-300"
    : n < 0
      ? "text-rose-600 dark:text-rose-300"
      : "text-muted";
}

const ARROW = <span className="text-faint">→</span>;

function GroupHeading({ kind, count }: { kind: DiffKind; count: number }) {
  const s = diffKindStyle(kind);
  return (
    <div className="mb-2 mt-5 flex items-center gap-2 first:mt-0">
      <Badge className={s.className}>{s.label}</Badge>
      <span className="text-xs text-faint">{count}</span>
    </div>
  );
}

function Unchanged({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="mt-3 text-xs text-faint">
      {formatNumber(count)} unchanged
    </p>
  );
}

/* -- page -------------------------------------------------------------- */

export default async function DiffPage({
  params,
}: {
  params: Promise<{ id: string; otherId: string }>;
}) {
  const { id, otherId } = await params;

  const [a, b] = await Promise.all([
    getAnalysisCached(id),
    getAnalysisCached(otherId),
  ]);
  if (!a || !b) notFound();

  const backLink = (
    <Link
      href={`/analysis/${id}/versions`}
      className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-text"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M10 3.5 5.5 8 10 12.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Version history
    </Link>
  );

  // Cross-lineage guard: refuse to compare analyses of different repos.
  if (
    repoKeyFor(a.metadata.repoUrl, a.metadata.repoName) !==
    repoKeyFor(b.metadata.repoUrl, b.metadata.repoName)
  ) {
    return (
      <div>
        {backLink}
        <SectionHeader kicker="Diff" title="What changed" />
        <EmptyState
          title="These can't be compared."
          hint="These two analyses are from different repositories and can't be compared."
        />
      </div>
    );
  }

  // Orient strictly by analyzed time: base = older, head = newer.
  const aTime = new Date(a.metadata.analyzedAt).getTime();
  const bTime = new Date(b.metadata.analyzedAt).getTime();
  const base = aTime <= bTime ? a : b;
  const head = aTime <= bTime ? b : a;

  const diff = diffAnalyses(base, head);

  const baseDate = formatDate(base.metadata.analyzedAt);
  const headDate = formatDate(head.metadata.analyzedAt);
  const daysApart = Math.max(
    0,
    Math.round(
      (new Date(head.metadata.analyzedAt).getTime() -
        new Date(base.metadata.analyzedAt).getTime()) /
        86_400_000,
    ),
  );

  const baseSha = shortSha(diff.base.commitSha);
  const headSha = shortSha(diff.head.commitSha);
  const analyzerChanged =
    diff.base.analyzerVersion !== diff.head.analyzerVersion;

  const gh = parseGitHubRepo(head.metadata.repoUrl);
  const compareUrl =
    gh && diff.base.commitSha && diff.head.commitSha
      ? `https://github.com/${gh.owner}/${gh.repo}/compare/${diff.base.commitSha}...${diff.head.commitSha}`
      : null;

  const headerCard = (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text">
        <span>{baseDate}</span>
        {ARROW}
        <span>{headDate}</span>
        <span className="text-xs text-faint">
          ({daysApart} {daysApart === 1 ? "day" : "days"} apart)
        </span>
      </div>

      {baseSha && headSha ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[0.72rem] text-muted">
          <span className="rounded bg-surface-2 px-1.5 py-0.5">{baseSha}</span>
          {ARROW}
          <span className="rounded bg-surface-2 px-1.5 py-0.5">{headSha}</span>
        </div>
      ) : null}

      {analyzerChanged ? (
        <p className="mt-2 text-xs text-faint">
          Analyzer{" "}
          <span className="font-mono text-muted">
            {diff.base.analyzerVersion}
          </span>{" "}
          → <span className="font-mono text-muted">{diff.head.analyzerVersion}</span>
        </p>
      ) : null}

      {compareUrl ? (
        <a
          href={compareUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          View commit range on GitHub
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M6 3h7v7M13 3 4 12"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      ) : null}
    </Card>
  );

  return (
    <div>
      {backLink}
      <SectionHeader
        kicker="Diff"
        title="What changed"
        description={`Structural changes between ${baseDate} and ${headDate}.`}
      />

      {headerCard}

      {!diff.hasChanges ? (
        <div className="mt-6">
          <EmptyState
            title="No structural changes between these runs."
            hint="The two analyses describe the same structure — same files, hotspots, graph and architecture. Narrative text is regenerated every run and is intentionally not compared."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <StatsSection diff={diff} />
          <HotspotsSection diff={diff} />
          <GraphSection diff={diff} />
          <ArchitectureSectionBlock diff={diff} />
        </div>
      )}
    </div>
  );
}

/* -- stats ------------------------------------------------------------- */

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 px-4 py-3">
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-xs text-faint">{label}</div>
    </div>
  );
}

function StatsSection({ diff }: { diff: ReturnType<typeof diffAnalyses> }) {
  const { stats } = diff;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Size
      </h2>
      <div className="flex flex-wrap gap-3">
        <Tile
          label="files"
          value={signed(stats.filesDelta)}
          tone={deltaClass(stats.filesDelta)}
        />
        <Tile
          label="lines of code"
          value={signed(stats.locDelta)}
          tone={deltaClass(stats.locDelta)}
        />
      </div>

      {stats.languages.length > 0 ? (
        <div className="mt-4 space-y-1.5">
          {stats.languages.map((l) => {
            const d = l.locAfter - l.locBefore;
            return (
              <div
                key={l.language}
                className="flex items-center gap-2 text-sm"
              >
                <span className="w-32 shrink-0 truncate text-text">
                  {l.language}
                </span>
                <span className="font-mono text-xs text-muted">
                  {formatNumber(l.locBefore)}
                </span>
                {ARROW}
                <span className="font-mono text-xs text-muted">
                  {formatNumber(l.locAfter)}
                </span>
                <span className={`ml-auto font-mono text-xs ${deltaClass(d)}`}>
                  {signed(d)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

/* -- hotspots ---------------------------------------------------------- */

function HotspotRow({ d }: { d: HotspotDelta }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">
        {d.path}
      </span>

      {d.kind === "changed" && d.activityChange ? (
        <span className="inline-flex items-center gap-1.5">
          <Badge className={activityStyle(d.activityChange.from).className}>
            {activityStyle(d.activityChange.from).label}
          </Badge>
          {ARROW}
          <Badge className={activityStyle(d.activityChange.to).className}>
            {activityStyle(d.activityChange.to).label}
          </Badge>
        </span>
      ) : d.kind === "added" && d.after ? (
        <Badge className={activityStyle(d.after.recentActivity).className}>
          {activityStyle(d.after.recentActivity).label}
        </Badge>
      ) : d.kind === "removed" && d.before ? (
        <Badge className={activityStyle(d.before.recentActivity).className}>
          {activityStyle(d.before.recentActivity).label}
        </Badge>
      ) : null}

      {d.kind === "changed" ? (
        <span className={`font-mono text-xs ${deltaClass(d.commitsDelta ?? 0)}`}>
          {signed(d.commitsDelta ?? 0)} commits
        </span>
      ) : d.kind === "added" && d.after ? (
        <span className="font-mono text-xs text-muted">
          {formatNumber(d.after.commits)} commits
        </span>
      ) : d.kind === "removed" && d.before ? (
        <span className="font-mono text-xs text-muted">
          {formatNumber(d.before.commits)} commits
        </span>
      ) : null}

      {d.kind === "changed" && d.churnScoreDelta !== undefined ? (
        <span
          className={`font-mono text-xs ${deltaClass(d.churnScoreDelta)}`}
        >
          {signed(d.churnScoreDelta)} churn
        </span>
      ) : null}
    </div>
  );
}

function DeltaGroups<T extends { kind: DiffKind }>({
  deltas,
  render,
}: {
  deltas: T[];
  render: (d: T, i: number) => ReactNode;
}) {
  const kinds: DiffKind[] = ["added", "changed", "removed"];
  return (
    <>
      {kinds.map((kind) => {
        const group = deltas.filter((d) => d.kind === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind}>
            <GroupHeading kind={kind} count={group.length} />
            <div className="space-y-1.5">{group.map(render)}</div>
          </div>
        );
      })}
    </>
  );
}

function HotspotsSection({ diff }: { diff: ReturnType<typeof diffAnalyses> }) {
  const { deltas, unchangedCount } = diff.hotspots;
  if (deltas.length === 0 && unchangedCount === 0) return null;
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
        Hotspots
      </h2>
      <DeltaGroups
        deltas={deltas}
        render={(d) => <HotspotRow key={d.path} d={d} />}
      />
      <Unchanged count={unchangedCount} />
    </section>
  );
}

/* -- dependency graph -------------------------------------------------- */

function NodeRow({ d }: { d: GraphNodeDelta }) {
  const node = d.after ?? d.before;
  const label = node?.label ?? d.id;
  const kindsDiffer =
    d.kind === "changed" &&
    d.before &&
    d.after &&
    d.before.kind !== d.after.kind;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-text">{label}</span>
      {kindsDiffer && d.before && d.after ? (
        <span className="inline-flex items-center gap-1.5">
          <Badge className={kindStyle(d.before.kind).className}>
            {kindStyle(d.before.kind).label}
          </Badge>
          {ARROW}
          <Badge className={kindStyle(d.after.kind).className}>
            {kindStyle(d.after.kind).label}
          </Badge>
        </span>
      ) : node ? (
        <Badge className={kindStyle(node.kind).className}>
          {kindStyle(node.kind).label}
        </Badge>
      ) : null}
    </div>
  );
}

function EdgeRow({ d }: { d: GraphEdgeDelta }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">
        {d.from} {"→"} {d.to}
      </span>
      {d.kind === "changed" ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className="font-mono">{d.relationshipBefore ?? "—"}</span>
          {ARROW}
          <span className="font-mono">{d.relationshipAfter ?? "—"}</span>
        </span>
      ) : (d.relationshipAfter ?? d.relationshipBefore) ? (
        <span className="font-mono text-xs text-muted">
          {d.relationshipAfter ?? d.relationshipBefore}
        </span>
      ) : null}
    </div>
  );
}

function GraphSection({ diff }: { diff: ReturnType<typeof diffAnalyses> }) {
  const { nodes, edges } = diff.graph;
  if (
    nodes.deltas.length === 0 &&
    edges.deltas.length === 0 &&
    nodes.unchangedCount === 0 &&
    edges.unchangedCount === 0
  ) {
    return null;
  }
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
        Dependency graph
      </h2>

      <div className="mt-2">
        <h3 className="mb-1 text-xs font-medium text-faint">Nodes</h3>
        <DeltaGroups
          deltas={nodes.deltas}
          render={(d) => <NodeRow key={d.id} d={d} />}
        />
        <Unchanged count={nodes.unchangedCount} />
      </div>

      <div className="mt-4">
        <h3 className="mb-1 text-xs font-medium text-faint">Edges</h3>
        <DeltaGroups
          deltas={edges.deltas}
          render={(d) => <EdgeRow key={`${d.from}|${d.to}`} d={d} />}
        />
        <Unchanged count={edges.unchangedCount} />
      </div>
    </section>
  );
}

/* -- architecture ------------------------------------------------------ */

function DiagramSource({ label, source }: { label: string; source?: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-faint">{label}</div>
      <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-[0.72rem] leading-relaxed text-muted">
        {source ?? "(no diagram)"}
      </pre>
    </div>
  );
}

function ArchitectureCard({ d }: { d: ArchitectureDelta }) {
  const s = diffKindStyle(d.kind);
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={s.className}>{s.label}</Badge>
        <h3 className="text-base font-semibold text-text">{d.title}</h3>
        {d.kind === "changed" && d.bodyChanged ? (
          <Badge className="border-border bg-surface-2 text-muted">Body</Badge>
        ) : null}
        {d.kind === "changed" && d.diagramChanged ? (
          <Badge className="border-border bg-surface-2 text-muted">Diagram</Badge>
        ) : null}
      </div>

      {d.kind === "added" && d.after ? (
        <>
          <p className="mt-2 text-sm text-muted">New section.</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-accent">
              Show content
            </summary>
            <div className="mt-3">
              <Markdown>{d.after.body}</Markdown>
            </div>
          </details>
        </>
      ) : null}

      {d.kind === "removed" && d.before ? (
        <>
          <p className="mt-2 text-sm text-muted">Section removed.</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-accent">
              Show previous content
            </summary>
            <div className="mt-3">
              <Markdown>{d.before.body}</Markdown>
            </div>
          </details>
        </>
      ) : null}

      {d.kind === "changed" && d.before && d.after ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-accent">
            Show before / after
          </summary>
          {d.bodyChanged ? (
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-faint">Before</div>
                <Markdown>{d.before.body}</Markdown>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-faint">After</div>
                <Markdown>{d.after.body}</Markdown>
              </div>
            </div>
          ) : null}
          {d.diagramChanged ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <DiagramSource label="Diagram before" source={d.before.diagram?.source} />
              <DiagramSource label="Diagram after" source={d.after.diagram?.source} />
            </div>
          ) : null}
        </details>
      ) : null}
    </Card>
  );
}

function ArchitectureSectionBlock({
  diff,
}: {
  diff: ReturnType<typeof diffAnalyses>;
}) {
  const { deltas, unchangedCount } = diff.architecture;
  if (deltas.length === 0 && unchangedCount === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Architecture
      </h2>
      <div className="space-y-3">
        {deltas.map((d) => (
          <ArchitectureCard key={`${d.kind}:${d.title}`} d={d} />
        ))}
      </div>
      <Unchanged count={unchangedCount} />
    </section>
  );
}
