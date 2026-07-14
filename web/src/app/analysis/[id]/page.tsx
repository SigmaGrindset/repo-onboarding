import Link from "next/link";
import { resolveDataSource } from "@/lib/datasource";
import { formatNumber } from "@/lib/format";
import {
  CATEGORY_ORDER,
  categoryStyle,
  LANGUAGE_PALETTE,
} from "@/lib/styles";
import { Badge, Card, SectionHeader } from "@/components/ui";
import { notFound } from "next/navigation";
import type { TechStackCategory } from "@schema/analysis";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  const { pitch, metadata } = analysis;
  const { stats } = metadata;

  // Group tech stack by category, preserving CATEGORY_ORDER.
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: pitch.techStack.filter((t) => t.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <SectionHeader
        kicker="Overview"
        title={metadata.repoName}
        description={pitch.summary}
      />

      {/* Key stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total files" value={formatNumber(stats.totalFiles)} />
        <Stat label="Lines of code" value={formatNumber(stats.totalLoc)} />
        <Stat label="Languages" value={String(stats.languages.length)} />
        <Stat label="Primary" value={metadata.primaryLanguage} />
      </div>

      {/* Language breakdown */}
      <Card className="mb-6 p-5">
        <h3 className="mb-3 text-sm font-semibold text-text">
          Language breakdown
        </h3>
        <LanguageBar languages={stats.languages} />
        <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {stats.languages.map((l, i) => (
            <li
              key={l.language}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{
                  background:
                    LANGUAGE_PALETTE[i % LANGUAGE_PALETTE.length],
                }}
              />
              <span className="text-text">{l.language}</span>
              <span className="ml-auto tabular-nums text-faint">
                {l.percentage}%
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Audience */}
      <Card className="mb-6 p-5">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
          <span className="text-accent">Who this is for</span>
        </h3>
        <p className="text-[0.95rem] leading-relaxed text-muted">
          {pitch.audience}
        </p>
      </Card>

      {/* Tech stack grouped by category */}
      <div className="mb-6">
        <h3 className="mb-4 text-sm font-semibold text-text">Tech stack</h3>
        <div className="space-y-5">
          {grouped.map((g) => (
            <TechCategory key={g.cat} category={g.cat} items={g.items} />
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/analysis/${id}/tour`}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover"
        >
          Start the guided tour
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M6 3.5 10.5 8 6 12.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <Link
          href={`/analysis/${id}/architecture`}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border-strong"
        >
          Read the architecture
        </Link>
      </div>

      {/* Discover the BYO-model flow — subtle, doesn't compete with the analysis. */}
      <div className="mt-10 border-t border-border pt-5 text-sm text-muted">
        Want one of these for your own codebase?{" "}
        <Link href="/generate" className="text-accent hover:underline">
          Generate one for your repo →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="truncate text-lg font-semibold tabular-nums text-text">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-faint">{label}</div>
    </Card>
  );
}

function LanguageBar({
  languages,
}: {
  languages: { language: string; percentage: number }[];
}) {
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
      {languages.map((l, i) => (
        <div
          key={l.language}
          title={`${l.language} — ${l.percentage}%`}
          style={{
            width: `${l.percentage}%`,
            background: LANGUAGE_PALETTE[i % LANGUAGE_PALETTE.length],
          }}
        />
      ))}
    </div>
  );
}

function TechCategory({
  category,
  items,
}: {
  category: TechStackCategory;
  items: { name: string; role: string }[];
}) {
  const style = categoryStyle(category);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Badge className={style.className}>{style.label}</Badge>
        <span className="text-xs text-faint">{items.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {items.map((t) => (
          <Card key={t.name} className="p-3.5">
            <div className="text-sm font-semibold text-text">{t.name}</div>
            <p className="mt-1 text-[0.83rem] leading-relaxed text-muted">
              {t.role}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
