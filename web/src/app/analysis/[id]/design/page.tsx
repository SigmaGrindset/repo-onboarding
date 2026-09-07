import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { githubBlobUrl } from "@/lib/github";
import { primitiveAnchor } from "@/lib/design-system";
import { Card, FileChip, SectionHeader } from "@/components/ui";
import { JumpToParam } from "@/components/JumpToParam";

export const dynamic = "force-dynamic";

/**
 * A list heading and the promise that list makes. The two lists here make
 * OPPOSITE promises — the tokens are a way in, the primitives are the set — and
 * ADR 0005 says the section is unreadable if that blurs, so the note is a
 * required prop rather than an optional flourish.
 */
function ListHeader({ title, promise }: { title: string; promise: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-[1.05rem] font-semibold tracking-[-0.01em] text-text">
        {title}
      </h2>
      <p className="text-[0.8rem] text-faint">{promise}</p>
    </div>
  );
}

/** One half of the reuse rule. `.kicker` is the repository's own label style. */
function RuleHalf({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="kicker text-accent">{title}</h3>
      <p className="mt-2 text-[0.87rem] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export default async function DesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  // A specialized section: absent means this repository has no design system of
  // its own, not that the document is behind. There is no empty state to fall
  // back to — the page does not exist, exactly as the nav says. See ADR 0004.
  const system = analysis.designSystem;
  if (!system) notFound();

  const { approach, tokens, primitives, reuseRule } = system;
  const { repoUrl, commitSha } = analysis.metadata;

  return (
    <div>
      <JumpToParam param="primitive" prefix="primitive-" />
      <SectionHeader
        kicker="Design System"
        title="How this interface is built"
        description="The way styles are written here, the tokens to reference, the primitives to build from, and when to add a new one. Read the rule before your first interface change."
      />

      {/* The two things ADR 0005 lifted out of the rows and up to the section:
          the styling approach and the reuse rule. They lead because they are
          where a reader's attention is worth spending — the lists below are
          reference, this is the practice. */}
      <Card className="p-5 sm:p-6">
        <h2 className="kicker text-accent">The approach</h2>
        <p className="mt-3 max-w-[68ch] text-[0.95rem] leading-relaxed text-text">
          {approach}
        </p>

        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          {/* Two halves, side by side, because that is the whole point of
              splitting the rule: an engine asked for one blob writes the
              platitude and drops the test for when creating is right, and a
              reader shown one paragraph reads only the first sentence. */}
          <RuleHalf title="Reuse when">{reuseRule.reuseWhen}</RuleHalf>
          <RuleHalf title="Create when">{reuseRule.createWhen}</RuleHalf>
        </div>

        <p className="mt-5 flex flex-wrap items-center gap-2 text-[0.83rem] text-faint">
          A genuinely new primitive belongs in
          {/* `newPrimitiveHome` may be a directory, and `githubBlobUrl` builds a
              /blob/ permalink, which only resolves for a file. A directory keeps
              the chip and loses the link rather than offering a dead one. */}
          <FileChip
            path={reuseRule.newPrimitiveHome}
            href={
              reuseRule.newPrimitiveHome.endsWith("/")
                ? null
                : githubBlobUrl(repoUrl, commitSha, reuseRule.newPrimitiveHome)
            }
          />
        </p>
      </Card>

      {/* Sampled, and it has to say so. If a token is not listed it very likely
          exists and this is not where you would find it — the opposite promise
          to the primitives below, and the section is unreadable if the two
          blur. No values anywhere: a swatch is still a swatch when it is the
          wrong blue, so the file is the reference and this is the way in. */}
      <section className="mt-6">
        <ListHeader
          title="Token groups"
          promise={
            <>
              {tokens.length} {tokens.length === 1 ? "group" : "groups"} ·
              sampled, not exhaustive — each file below is the full list
            </>
          }
        />

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {tokens.map((group) => (
            <Card key={`${group.name}-${group.file}`} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[0.95rem] font-semibold text-text">
                  {group.name}
                </h3>
                <FileChip
                  path={group.file}
                  href={githubBlobUrl(repoUrl, commitSha, group.file)}
                />
              </div>
              <p className="mt-2.5 text-[0.83rem] leading-relaxed text-muted">
                {group.usage}
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {group.examples.map((example) => (
                  <li key={example}>
                    <code className="inline-block rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.75rem] text-text">
                      {example}
                    </code>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Exhaustive, and it has to say so: a component that is not here does
          not exist, which is the only thing that makes the list worth reading
          before writing a fourth Button. Two entries may share a name — that is
          allowed on purpose, so the file is part of what identifies a row. */}
      <section className="mt-8">
        <ListHeader
          title="Primitives"
          promise={
            <>
              {primitives.length}{" "}
              {primitives.length === 1 ? "primitive" : "primitives"} ·
              exhaustive — one that is not here does not exist
            </>
          }
        />

        <Card className="mt-3">
          {/* A list rather than a table: three columns of which one is prose
              would size the name column to a paragraph, and a phone would have
              to scroll sideways to read the one thing every row is here for. */}
          <ul>
            {primitives.map((primitive) => (
              <li
                key={primitiveAnchor(primitive)}
                id={`primitive-${primitiveAnchor(primitive)}`}
                className="grid scroll-mt-20 gap-x-5 gap-y-1.5 border-b border-border/60 px-4 py-3.5 last:border-0 sm:grid-cols-[minmax(6rem,max-content)_1fr]"
              >
                <code className="font-mono text-[0.88rem] font-semibold text-text">
                  {primitive.name}
                </code>
                <div className="min-w-0">
                  <p className="max-w-[68ch] text-[0.85rem] leading-relaxed text-muted">
                    {primitive.use}
                  </p>
                  <div className="mt-2">
                    <FileChip
                      path={primitive.file}
                      href={githubBlobUrl(repoUrl, commitSha, primitive.file)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
