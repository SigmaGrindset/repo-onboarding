/**
 * Shared reading of a design system. Small on purpose, for the same reason
 * `api-surface.ts` is: the section is mostly data the viewer renders directly,
 * and the one thing more than one surface needs is the anchor a primitive is
 * addressed by — the section page renders it as a DOM id and the command
 * palette links to it, so the two must agree.
 */

import type { DesignPrimitive } from "@schema/analysis";
import { slugify } from "./format";

/**
 * The DOM id / `?primitive=` value one primitive is deep-linked by.
 *
 * The file is part of the anchor, not decoration. Two primitives may share a
 * name: a uniqueness rule was rejected outright, because two components called
 * `Button` in two files is a true statement about a repository and precisely
 * the one a reader most needs — see the Primitive entry in CONTEXT.md, which
 * the schema restates. So the name alone cannot address one of them, the same
 * problem the API surface has with two methods on one path.
 */
export function primitiveAnchor(primitive: DesignPrimitive): string {
  return slugify(`${primitive.name} ${primitive.file}`);
}
