#!/usr/bin/env node
/**
 * Edge-integrity check for a Repo Onboarding analysis.json.
 *
 * The JSON Schema validates structure but intentionally does NOT enforce that
 * every dependencyGraph edge references an existing node id. This script closes
 * that gap. Run it AFTER schema/validate.mjs passes.
 *
 * Usage:
 *   node edges-check.mjs <path-to-analysis.json>
 *
 * Exit codes:
 *   0  every edge.from / edge.to matches a node id (and nodes are unique)
 *   1  dangling edge(s) or duplicate node id(s) found
 *   2  usage / IO / parse error
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node edges-check.mjs <path-to-analysis.json>");
  process.exit(2);
}

let doc;
try {
  doc = JSON.parse(readFileSync(resolve(process.cwd(), target), "utf8"));
} catch (e) {
  console.error(`Could not read/parse ${target}: ${e.message}`);
  process.exit(2);
}

const nodes = doc?.dependencyGraph?.nodes;
const edges = doc?.dependencyGraph?.edges;
if (!Array.isArray(nodes) || !Array.isArray(edges)) {
  console.error("dependencyGraph.nodes / dependencyGraph.edges missing or not arrays.");
  process.exit(2);
}

const ids = new Set();
const dupes = [];
for (const n of nodes) {
  if (ids.has(n.id)) dupes.push(n.id);
  ids.add(n.id);
}

const dangling = [];
edges.forEach((e, i) => {
  if (!ids.has(e.from)) dangling.push(`edge[${i}].from -> "${e.from}" (no such node id)`);
  if (!ids.has(e.to)) dangling.push(`edge[${i}].to -> "${e.to}" (no such node id)`);
});

if (dupes.length === 0 && dangling.length === 0) {
  console.log(`EDGES OK: ${nodes.length} nodes, ${edges.length} edges, all references resolve.`);
  process.exit(0);
}

if (dupes.length) console.error(`DUPLICATE node ids: ${[...new Set(dupes)].join(", ")}`);
for (const d of dangling) console.error(`DANGLING ${d}`);
console.error(`\nedges-check FAILED: ${dupes.length} duplicate id(s), ${dangling.length} dangling reference(s).`);
process.exit(1);
