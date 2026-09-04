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
import { OnboardingJourney } from "@/components/OnboardingJourney";

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

      <OnboardingJourney
        analysisId={id}
        taskTitles={analysis.firstTasks.map((task) => task.title)}
      />

      {/* Key stats — one hairline-separated instrument strip rather than four
          identical floating boxes. */}
      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-soft sm:grid-cols-4">
        <Stat label="Total files" value={formatNumber(stats.totalFiles)} />
        <Stat label="Lines of code" value={formatNumber(stats.totalLoc)} />
        <Stat label="Languages" value={String(stats.languages.length)} />
        <Stat label="Primary" value={metadata.primaryLanguage} />
      </dl>

      {/* Language breakdown */}
      <Card className="mb-8 p-5 sm:p-6">
        <h3 className="mb-4 text-[0.95rem] font-semibold tracking-[-0.01em] text-text">
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
              <span className="ml-auto font-mono text-[0.8rem] tabular-nums text-faint">
                {l.percentage}%
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Audience — a pull-quote on an accent rule, not another card in the
          stack. It is a statement about the reader, so it should read like one. */}
      <section className="mb-10 border-l-2 border-accent py-1 pl-5 sm:pl-6">
        <h3 className="kicker mb-2 text-accent">Who this is for</h3>
        <p className="max-w-[44ch] text-[1.05rem] leading-[1.6] text-text">
          {pitch.audience}
        </p>
      </section>

      {/* Tech stack grouped by category */}
      <div className="mb-6">
        <h3 className="mb-5 text-[0.95rem] font-semibold tracking-[-0.01em] text-text">
          Tech stack
        </h3>
        <div className="space-y-6">
          {grouped.map((g) => (
            <TechCategory key={g.cat} category={g.cat} items={g.items} />
          ))}
        </div>
      </div>

      {/* Discover the BYO-model flow — subtle, doesn't compete with the analysis. */}
      <div className="mt-12 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-6 text-sm text-muted">
        Want one of these for your own codebase?
        <Link
          href="/generate"
          className="press group inline-flex items-center gap-1.5 font-medium text-accent underline decoration-accent/35 underline-offset-[3px] hover:decoration-accent"
        >
          Generate one for your repo
          <span
            aria-hidden
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          >
            &rarr;
          </span>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    // Flex + order so the figure reads above its label while <dt> keeps its
    // required document order before <dd>.
    <div className="flex flex-col bg-surface px-4 py-4">
      <dt className="order-2 mt-1.5 text-[0.7rem] text-faint">{label}</dt>
      <dd className="truncate font-mono text-[1.25rem] font-semibold leading-none tracking-[-0.02em] tabular-nums text-text">
        {value}
      </dd>
    </div>
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
      <div className="mb-3 flex items-center gap-2.5">
        <Badge className={style.className}>{style.label}</Badge>
        <span className="font-mono text-[0.7rem] tabular-nums text-faint">
          {items.length}
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      {/* A lone item runs the full width rather than sitting in a half column
          beside dead space. */}
      <div
        className={`grid gap-2.5 ${
          items.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
        }`}
      >
        {items.map((t) => (
          // `quiet` — these sit inside the stack, so they should not read as
          // another top-level card with its own frame and shadow.
          <Card key={t.name} tone="quiet" radius="lg" className="p-4">
            <div className="text-[0.9rem] font-semibold tracking-[-0.01em] text-text">
              {t.name}
            </div>
            <p className="mt-1.5 text-[0.85rem] leading-[1.6] text-muted">
              {t.role}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
