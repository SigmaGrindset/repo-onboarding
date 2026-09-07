/**
 * Shared reading of a delivery section. Small on purpose, for the same reason
 * `api-surface.ts` and `design-system.ts` are: the section is mostly data the
 * viewer renders directly, and the one thing more than one surface needs is the
 * anchor a gate is addressed by — the section page renders it as a DOM id and
 * the command palette links to it, so the two must agree.
 */

import type { DeliveryGate } from "@schema/analysis";
import { slugify } from "./format";

/**
 * The DOM id / `?gate=` value one gate is deep-linked by.
 *
 * The file is part of the anchor for the same reason it is part of a
 * primitive's: a gate is named as this repository names it, and two workflow
 * files may each define a job called `test`. Naming both is also the honest
 * answer to "which `test` did I just jump to?".
 */
export function gateAnchor(gate: DeliveryGate): string {
  return slugify(`${gate.name} ${gate.file}`);
}
