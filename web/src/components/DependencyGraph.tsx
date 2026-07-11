"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DependencyGraph as DependencyGraphData,
  GraphNode,
  GraphNodeKind,
} from "@schema/analysis";
import { kindStyle } from "@/lib/styles";
import { Badge } from "@/components/ui";

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
  relationship?: string;
}

const NODE_R = 9;
const MIN_K = 0.3;
const MAX_K = 4;

function truncate(s: string, n = 22): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function DependencyGraph({ data }: { data: DependencyGraphData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  // Mirror of the latest node objects for use inside event handlers only.
  const nodesRef = useRef<SimNode[]>([]);

  // Populated (and re-cloned on every simulation tick) from the tick callback,
  // never synchronously in an effect body. Node objects are mutated in place by
  // d3; a fresh array identity is what tells React to repaint.
  const [graph, setGraph] = useState<{ nodes: SimNode[]; links: SimLink[] }>({
    nodes: [],
    links: [],
  });
  const [dims, setDims] = useState({ w: 800, h: 560 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverKind, setHoverKind] = useState<GraphNodeKind | null>(null);

  // Adjacency for neighbourhood highlighting.
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of data.nodes) map.set(n.id, new Set());
    for (const e of data.edges) {
      map.get(e.from)?.add(e.to);
      map.get(e.to)?.add(e.from);
    }
    return map;
  }, [data]);

  // Distinct kinds present, for the legend.
  const legendKinds = useMemo(() => {
    const seen = new Map<GraphNodeKind, number>();
    for (const n of data.nodes) seen.set(n.kind, (seen.get(n.kind) ?? 0) + 1);
    return [...seen.entries()];
  }, [data]);

  // Measure the container before building the simulation.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () =>
      setDims({
        w: el.clientWidth || 800,
        h: Math.max(el.clientHeight || 560, 420),
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build (once per dataset) and run the force simulation.
  useEffect(() => {
    const w = dims.w;
    const h = dims.h;
    const nodes: SimNode[] = data.nodes.map((n, i) => {
      const angle = (i / data.nodes.length) * Math.PI * 2;
      return {
        ...n,
        x: w / 2 + Math.cos(angle) * 140,
        y: h / 2 + Math.sin(angle) * 140,
      };
    });
    const links: SimLink[] = data.edges.map((e) => ({
      source: e.from,
      target: e.to,
      relationship: e.relationship,
    }));

    nodesRef.current = nodes;

    const sim = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(95)
          .strength(0.35),
      )
      .force("charge", forceManyBody<SimNode>().strength(-430))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide<SimNode>(NODE_R * 2.4))
      .force("x", forceX<SimNode>(w / 2).strength(0.05))
      .force("y", forceY<SimNode>(h / 2).strength(0.05));

    // The simulation auto-starts and fires ticks on its internal timer; each
    // tick publishes fresh array identities so React repaints. The very first
    // paint (empty) lasts a single frame until the first tick lands.
    sim.on("tick", () =>
      setGraph({ nodes: nodes.slice(), links: links.slice() }),
    );
    simRef.current = sim;

    return () => {
      sim.stop();
    };
    // Center/x/y forces are updated on resize in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Keep the centring forces in sync with the measured size.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.force("center", forceCenter(dims.w / 2, dims.h / 2));
    (sim.force("x") as ReturnType<typeof forceX<SimNode>>)?.x(dims.w / 2);
    (sim.force("y") as ReturnType<typeof forceY<SimNode>>)?.y(dims.h / 2);
    sim.alpha(0.3).restart();
  }, [dims]);

  // Convert a client point to graph-space coordinates.
  const toGraph = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const left = rect?.left ?? 0;
      const top = rect?.top ?? 0;
      return {
        x: (clientX - left - transform.x) / transform.k,
        y: (clientY - top - transform.y) / transform.k,
      };
    },
    [transform],
  );

  // --- Panning (background drag) -----------------------------------------
  const panState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    setSelectedId(null);
    setIsPanning(true);
    panState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: transform.x,
      origY: transform.y,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  // --- Node dragging ------------------------------------------------------
  const dragState = useRef<string | null>(null);

  const onNodePointerDown = (e: React.PointerEvent, node: SimNode) => {
    e.stopPropagation();
    dragState.current = node.id;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toGraph(e.clientX, e.clientY);
    node.fx = p.x;
    node.fy = p.y;
    simRef.current?.alphaTarget(0.3).restart();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragState.current) {
      const node = nodesRef.current.find((n) => n.id === dragState.current);
      if (node) {
        const p = toGraph(e.clientX, e.clientY);
        node.fx = p.x;
        node.fy = p.y;
      }
      return;
    }
    if (panState.current) {
      const ps = panState.current;
      setTransform((t) => ({
        ...t,
        x: ps.origX + (e.clientX - ps.startX),
        y: ps.origY + (e.clientY - ps.startY),
      }));
    }
  };

  const endInteraction = () => {
    if (dragState.current) {
      const node = nodesRef.current.find((n) => n.id === dragState.current);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      simRef.current?.alphaTarget(0);
      dragState.current = null;
    }
    if (panState.current) {
      panState.current = null;
      setIsPanning(false);
    }
  };

  // --- Zoom (wheel, cursor-anchored) -------------------------------------
  const onWheel = (e: React.WheelEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const sx = e.clientX - (rect?.left ?? 0);
    const sy = e.clientY - (rect?.top ?? 0);
    setTransform((t) => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const k = Math.min(MAX_K, Math.max(MIN_K, t.k * factor));
      const gx = (sx - t.x) / t.k;
      const gy = (sy - t.y) / t.k;
      return { k, x: sx - gx * k, y: sy - gy * k };
    });
  };

  const zoomBy = (factor: number) =>
    setTransform((t) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, t.k * factor));
      const cx = dims.w / 2;
      const cy = dims.h / 2;
      const gx = (cx - t.x) / t.k;
      const gy = (cy - t.y) / t.k;
      return { k, x: cx - gx * k, y: cy - gy * k };
    });

  const reset = () => setTransform({ x: 0, y: 0, k: 1 });

  // --- Highlight computation ---------------------------------------------
  const activeId = hoverId ?? selectedId;
  const highlightSet = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    adjacency.get(activeId)?.forEach((n) => set.add(n));
    return set;
  }, [activeId, adjacency]);

  const isNodeLit = (node: SimNode): boolean => {
    if (hoverKind) return node.kind === hoverKind;
    if (!highlightSet) return true;
    return highlightSet.has(node.id);
  };

  const isEdgeLit = (src: string, tgt: string): boolean => {
    if (hoverKind) return false;
    if (!activeId) return false;
    return src === activeId || tgt === activeId;
  };

  const selectedNode = selectedId
    ? (data.nodes.find((n) => n.id === selectedId) ?? null)
    : null;

  return (
    <div className="relative flex flex-col gap-3 lg:flex-row">
      <div
        ref={containerRef}
        className="relative h-[560px] flex-1 overflow-hidden rounded-xl border border-border bg-surface"
      >
        {/* Controls */}
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
          <GraphButton label="Zoom in" onClick={() => zoomBy(1.25)}>
            +
          </GraphButton>
          <GraphButton label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
            −
          </GraphButton>
          <GraphButton label="Reset view" onClick={reset}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </GraphButton>
        </div>

        <p className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[90%] text-[0.7rem] text-faint">
          Scroll to zoom · drag background to pan · drag a node to move it ·
          click for details
        </p>

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="touch-none select-none"
          style={{ cursor: isPanning ? "grabbing" : "grab" }}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endInteraction}
          onPointerLeave={endInteraction}
          onWheel={onWheel}
        >
          <defs>
            <marker
              id="dg-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 10 5 0 10z" className="fill-[var(--border-strong)]" />
            </marker>
            <marker
              id="dg-arrow-lit"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M0 0 10 5 0 10z" className="fill-[var(--accent)]" />
            </marker>
          </defs>

          <g
            transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
          >
            {/* Edges */}
            {graph.links.map((l, i) => {
              const s = l.source as SimNode;
              const t = l.target as SimNode;
              if (!s || !t || s.x == null || t.x == null) return null;
              const lit = isEdgeLit(s.id, t.id);
              const dim = (activeId != null || hoverKind != null) && !lit;
              const midX = (s.x + t.x) / 2;
              const midY = (s.y + t.y) / 2;
              return (
                <g key={i} opacity={dim ? 0.12 : 1}>
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={lit ? "var(--accent)" : "var(--border-strong)"}
                    strokeWidth={lit ? 1.6 : 1}
                    markerEnd={`url(#${lit ? "dg-arrow-lit" : "dg-arrow"})`}
                  />
                  {lit && l.relationship ? (
                    <text
                      x={midX}
                      y={midY}
                      dy={-3}
                      textAnchor="middle"
                      className="pointer-events-none fill-[var(--accent)] text-[9px] font-medium"
                      style={{ paintOrder: "stroke" }}
                      stroke="var(--surface)"
                      strokeWidth={3}
                    >
                      {l.relationship}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Nodes */}
            {graph.nodes.map((n) => {
              const lit = isNodeLit(n);
              const style = kindStyle(n.kind);
              const selected = n.id === selectedId;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  opacity={lit ? 1 : 0.25}
                  className="cursor-pointer"
                  onPointerDown={(e) => onNodePointerDown(e, n)}
                  onPointerEnter={() => setHoverId(n.id)}
                  onPointerLeave={() => setHoverId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId((cur) => (cur === n.id ? null : n.id));
                  }}
                >
                  <circle
                    r={selected ? NODE_R + 3 : NODE_R}
                    fill={style.color}
                    stroke={selected ? "var(--text)" : "var(--surface)"}
                    strokeWidth={selected ? 2.5 : 2}
                  />
                  <text
                    y={NODE_R + 12}
                    textAnchor="middle"
                    className="pointer-events-none fill-[var(--muted)] text-[9.5px] font-medium"
                    style={{ paintOrder: "stroke" }}
                    stroke="var(--surface)"
                    strokeWidth={3}
                  >
                    {truncate(n.label)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Side rail: details + legend */}
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
        {selectedNode ? (
          <NodeDetails node={selectedNode} onClose={() => setSelectedId(null)} />
        ) : null}

        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
            Node kinds
          </h3>
          <ul className="space-y-1.5">
            {legendKinds.map(([kind, count]) => {
              const style = kindStyle(kind);
              return (
                <li key={kind}>
                  <button
                    type="button"
                    onPointerEnter={() => setHoverKind(kind)}
                    onPointerLeave={() => setHoverKind(null)}
                    className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left text-sm transition hover:bg-surface-2"
                  >
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ background: style.color }}
                    />
                    <span className="text-text">{style.label}</span>
                    <span className="ml-auto tabular-nums text-xs text-faint">
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-[0.7rem] leading-relaxed text-faint">
            {data.nodes.length} nodes · {data.edges.length} edges. Hover a kind
            to isolate it.
          </p>
        </div>
      </div>
    </div>
  );
}

function GraphButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-base font-medium text-muted shadow-sm transition hover:border-border-strong hover:text-text"
    >
      {children}
    </button>
  );
}

function NodeDetails({
  node,
  onClose,
}: {
  node: GraphNode;
  onClose: () => void;
}) {
  const style = kindStyle(node.kind);
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Badge className={style.className}>{style.label}</Badge>
          <h3 className="mt-2 text-sm font-semibold text-text">{node.label}</h3>
        </div>
        <button
          type="button"
          aria-label="Close details"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-faint transition hover:bg-surface-2 hover:text-text"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {node.path ? (
        <p className="mt-2 break-all font-mono text-[0.72rem] text-accent">
          {node.path}
        </p>
      ) : null}
      {node.description ? (
        <p className="mt-2 text-[0.83rem] leading-relaxed text-muted">
          {node.description}
        </p>
      ) : null}
    </div>
  );
}
