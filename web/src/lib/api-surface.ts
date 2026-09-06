/**
 * Shared reading of an API surface. Small on purpose: the section is mostly
 * data the viewer renders directly, and the one thing more than one surface
 * needs is the anchor a route is addressed by — the section page renders it as
 * a DOM id and the command palette links to it, so the two must agree.
 */

import type { ApiRoute } from "@schema/analysis";
import { slugify } from "./format";

/** How a route is named to a reader: "GET /api/analyses". */
export function routeLabel(route: ApiRoute): string {
  return `${route.method} ${route.path}`;
}

/** The DOM id / `?route=` value one route is deep-linked by. */
export function routeAnchor(route: ApiRoute): string {
  return slugify(routeLabel(route));
}
