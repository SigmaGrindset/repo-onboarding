import { notFound } from "next/navigation";
import { resolveDataSource } from "@/lib/datasource";
import { githubBlobUrl } from "@/lib/github";
import { routeAnchor } from "@/lib/api-surface";
import { methodStyle, roleTint } from "@/lib/styles";
import { Badge, Card, FileChip, SectionHeader } from "@/components/ui";
import { JumpToParam } from "@/components/JumpToParam";

export const dynamic = "force-dynamic";

export default async function ApiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataSource = await resolveDataSource();
  const analysis = await dataSource.getAnalysis(id);
  if (!analysis) notFound();

  // A specialized section: absent means this repository has no API, not that
  // the document is behind. There is no empty state to fall back to — the page
  // does not exist, exactly as the nav says. See ADR 0004.
  const surface = analysis.apiSurface;
  if (!surface) notFound();

  const { routes } = surface;
  const { repoUrl, commitSha } = analysis.metadata;
  const actors = [...new Set(routes.map((r) => r.actor))];

  return (
    <div>
      <JumpToParam param="route" prefix="route-" />
      <SectionHeader
        kicker="API Surface"
        title="What this repository exposes"
        description="Every route this repository serves, with the file behind it and the caller allowed to reach it. The list is complete rather than curated: a route that is not here does not exist. Only the routes worth explaining carry a note."
      />

      <Card className="p-5">
        <p className="text-[0.83rem] text-faint">
          {routes.length} {routes.length === 1 ? "route" : "routes"} ·{" "}
          {actors.length} {actors.length === 1 ? "actor" : "actors"}
        </p>

        {/* Four columns of unbreakable content — a method, a path, an actor
            name and a repo-relative file — do not fit a phone and often do not
            fit a laptop either. The minimum is wide enough that the longest
            file path is never clipped, and the table scrolls inside this
            container rather than truncating or widening the page. */}
        <div className="-mx-5 mt-4 overflow-x-auto px-5">
          <table className="w-full min-w-[66rem] border-collapse text-left">
            <caption className="sr-only">
              Every route this repository exposes, with its method, path, the
              actor permitted to call it, and the file implementing it.
            </caption>
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-faint">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Method
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Path
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Actor
                </th>
                <th scope="col" className="py-2 font-semibold">
                  File
                </th>
              </tr>
            </thead>
            {/* One tbody per route, so a note is a second row that still
                belongs to the route above it. Keeping the note out of the Path
                cell is what lets the Path and File columns size to their own
                content instead of to a paragraph — with 35 routes, a note
                widening the Path column truncates every file path in the
                table. */}
            {routes.map((route) => {
              const method = methodStyle(route.method);
              return (
                <tbody
                  key={`${route.method} ${route.path} ${route.file}`}
                  className="border-b border-border/60 align-top last:border-0"
                >
                  <tr id={`route-${routeAnchor(route)}`} className="scroll-mt-20">
                    <td className="whitespace-nowrap pb-2 pr-4 pt-3">
                      <Badge className={`font-mono ${method.className}`}>
                        {method.label}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap pb-2 pr-4 pt-3">
                      <code className="font-mono text-[0.85rem] text-text">
                        {route.path}
                      </code>
                    </td>
                    {/* An actor name is several words and the same words on
                        every row it governs, so it has to read as one label
                        rather than a paragraph. The table scrolls instead. */}
                    <td className="whitespace-nowrap pb-2 pr-4 pt-3">
                      <Badge className={roleTint(route.actor)}>
                        {route.actor}
                      </Badge>
                    </td>
                    <td className="pb-2 pt-3">
                      <FileChip
                        path={route.file}
                        href={githubBlobUrl(repoUrl, commitSha, route.file)}
                      />
                    </td>
                  </tr>
                  {route.note ? (
                    <tr>
                      <td />
                      <td colSpan={3} className="pb-3 pr-4">
                        <p className="max-w-[68ch] text-[0.83rem] leading-relaxed text-muted">
                          {route.note}
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              );
            })}
          </table>
        </div>
      </Card>
    </div>
  );
}
