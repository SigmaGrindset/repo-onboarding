import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { githubBlobUrl } from "@/lib/github";
import { gateAnchor } from "@/lib/delivery";
import { Card, FileChip, SectionHeader } from "@/components/ui";
import { JumpToParam } from "@/components/JumpToParam";

export const dynamic = "force-dynamic";

/**
 * The boundary, stated once in fixed text — the same sentence the Markdown
 * export states, and the same for every repository.
 *
 * The document never carries it. A schema field asking an analysis engine to
 * state an absence is a field it fills with a plausible-sounding operational
 * summary, which is precisely the failure the boundary exists to prevent. So
 * the sentence lives here, where it cannot go stale and cannot be invented.
 * See `docs/adr/0006-delivery-stops-at-what-is-committed.md`.
 */
const BOUNDARY =
  "Everything here is read from a committed file. Production dashboards, log " +
  "access, rollback procedure and on-call are not in this repository, so they " +
  "are not here — a boundary rather than a gap.";

/** A list heading and the promise that list makes — the Design System's shape. */
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

/**
 * A command a reader types, as a reader would type it. Sized to match
 * `FileChip` rather than the design page's token chips: three of the four
 * places one appears, it sits inline BESIDE a file chip, and two mono chips
 * on one line at different sizes read as a mistake.
 */
function Command({ children }: { children: ReactNode }) {
  return (
    <code className="inline-block rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.78rem] text-text">
      {children}
    </code>
  );
}

export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  // A specialized section: absent means this repository commits nothing about
  // its own pipeline, not that the document is behind. There is no empty state
  // to fall back to — the page does not exist, exactly as the nav says. See
  // ADR 0004.
  const delivery = analysis.delivery;
  if (!delivery) notFound();

  const { pipeline, build, gates, environments, migrations, deployVariables } =
    delivery;
  const { repoUrl, commitSha } = analysis.metadata;
  const blob = (path: string) => githubBlobUrl(repoUrl, commitSha, path);

  return (
    <div>
      <JumpToParam param="gate" prefix="gate-" />
      <SectionHeader
        kicker="Delivery"
        title="What happens when this merges"
        description="The journey a change takes from your branch to something running: the checks it has to pass, what a deploy builds, and where it lands. Read it before your first pull request rather than learning it from a red check."
      />

      {/* The narrative, then the boundary. The pipeline paragraph is the only
          place the shape of the whole thing is stated, and the rows below only
          detail it — so a reader who reads nothing else should still be able to
          leave with it. */}
      <Card className="p-5 sm:p-6">
        <h2 className="kicker text-accent">The pipeline</h2>
        <p className="mt-3 max-w-[68ch] text-[0.95rem] leading-relaxed text-text">
          {pipeline}
        </p>

        <p className="mt-4 max-w-[68ch] border-l-2 border-border pl-3 text-[0.8rem] leading-relaxed text-faint">
          {BOUNDARY}
        </p>

        <div className="mt-6 border-t border-border pt-5">
          <h2 className="kicker text-accent">What a deploy runs</h2>
          <p className="mt-2.5 max-w-[68ch] text-[0.87rem] leading-relaxed text-muted">
            {build.produces}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.83rem] text-faint">
            <span>Defined in</span>
            <FileChip path={build.file} href={blob(build.file)} />
            {build.command ? (
              <>
                <span>· produced by</span>
                <Command>{build.command}</Command>
              </>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Exhaustive, and it has to say so: a check that is not here does not
          run, which is the only thing that makes the list worth reading before
          pushing rather than after a red check. */}
      <section className="mt-6">
        <ListHeader
          title="Gates"
          promise={
            <>
              {gates.length} {gates.length === 1 ? "gate" : "gates"} · exhaustive
              — a check that is not here does not run
            </>
          }
        />

        <Card className="mt-3">
          {/* A list rather than a table: four columns of which one is prose and
              two are unbreakable (a command, a repo-relative path) would force
              a phone to scroll sideways to read the one thing every row is here
              for. */}
          <ul>
            {gates.map((gate) => (
              <li
                key={gateAnchor(gate)}
                id={`gate-${gateAnchor(gate)}`}
                className="grid scroll-mt-20 gap-x-5 gap-y-1.5 border-b border-border/60 px-4 py-3.5 last:border-0 sm:grid-cols-[minmax(7rem,max-content)_1fr]"
              >
                <code className="font-mono text-[0.88rem] font-semibold text-text">
                  {gate.name}
                </code>
                <div className="min-w-0">
                  <p className="max-w-[68ch] text-[0.85rem] leading-relaxed text-muted">
                    {gate.checks}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <FileChip path={gate.file} href={blob(gate.file)} />
                    {/* The field that turns a list of checks into something a
                        newcomer can act on: the command that pre-empts this
                        gate before it ever runs against their branch. */}
                    {gate.runLocally ? (
                      <span className="text-[0.8rem] text-faint">
                        run it first: <Command>{gate.runLocally}</Command>
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Optional, and its absence is the boundary rather than an omission: a
          branch-to-environment mapping that lives in a hosting dashboard has no
          committed file to cite, so it is not claimed here at all. */}
      {environments?.length ? (
        <section className="mt-8">
          <ListHeader
            title="Environments"
            promise="each named with the committed file that maps a branch to it"
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {environments.map((env) => (
              <Card key={`${env.name}-${env.file}`} className="p-4">
                <h3 className="text-[0.95rem] font-semibold text-text">
                  {env.name}
                </h3>
                <p className="mt-1.5 text-[0.83rem] leading-relaxed text-muted">
                  Deployed from {env.deployedFrom}
                </p>
                <div className="mt-2.5">
                  <FileChip path={env.file} href={blob(env.file)} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Its own block because its most useful answer is "nothing does" — the
          sentence no gate row and no environment row can carry, and the one a
          newcomer shipping their first schema change most needs. */}
      {migrations ? (
        <section className="mt-8">
          <ListHeader title="Migrations" promise="what applies them, and when" />
          <Card className="mt-3 p-5">
            <p className="max-w-[68ch] text-[0.87rem] leading-relaxed text-text">
              {migrations.appliedBy}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.83rem] text-faint">
              <span>Files in</span>
              <FileChip path={migrations.directory} />
              {migrations.command ? (
                <>
                  <span>· applied with</span>
                  <Command>{migrations.command}</Command>
                </>
              ) : null}
            </div>
          </Card>
        </section>
      ) : null}

      {/* Exhaustive, unlike the design system's sampled token groups, and the
          promise has to say which of the two this is: a missing token name
          costs a browsing reader nothing, a missing required variable costs
          them a deploy that will not boot. Names and purposes only — there is
          nowhere in the document to put a value. */}
      {deployVariables?.length ? (
        <section className="mt-8">
          <ListHeader
            title="Deploy variables"
            promise={
              <>
                {deployVariables.length}{" "}
                {deployVariables.length === 1 ? "variable" : "variables"} ·
                exhaustive, names only — never values
              </>
            }
          />
          <Card className="mt-3">
            <ul>
              {deployVariables.map((variable) => (
                <li
                  key={`${variable.name}-${variable.file}`}
                  className="grid gap-x-5 gap-y-1.5 border-b border-border/60 px-4 py-3.5 last:border-0 sm:grid-cols-[minmax(10rem,max-content)_1fr]"
                >
                  <code className="font-mono text-[0.85rem] font-semibold text-text">
                    {variable.name}
                  </code>
                  <div className="min-w-0">
                    <p className="max-w-[68ch] text-[0.85rem] leading-relaxed text-muted">
                      {variable.purpose}
                    </p>
                    <div className="mt-2">
                      <FileChip path={variable.file} href={blob(variable.file)} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
