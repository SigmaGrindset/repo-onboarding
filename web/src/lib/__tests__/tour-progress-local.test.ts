/**
 * Unit tests for the pure part of the tour-progress localStorage helpers.
 *
 * Run with `npm test` (which invokes `tsx --test`). Only `normalizeFurthest`
 * is exercised — the read/write helpers need a real `localStorage`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFurthest } from "../tour-progress-local";

test("normalizeFurthest parses stored strings", () => {
  assert.equal(normalizeFurthest("4", 9), 4);
  assert.equal(normalizeFurthest("9", 9), 9);
  assert.equal(normalizeFurthest("1", 9), 1);
});

test("normalizeFurthest passes through valid numbers", () => {
  assert.equal(normalizeFurthest(4, 9), 4);
  assert.equal(normalizeFurthest(0, 9), 0);
});

test("normalizeFurthest collapses garbage to 0", () => {
  assert.equal(normalizeFurthest(null, 9), 0);
  assert.equal(normalizeFurthest(undefined, 9), 0);
  assert.equal(normalizeFurthest("", 9), 0);
  assert.equal(normalizeFurthest("abc", 9), 0);
  assert.equal(normalizeFurthest({}, 9), 0);
  assert.equal(normalizeFurthest(NaN, 9), 0);
  assert.equal(normalizeFurthest(Infinity, 9), 0);
});

test("normalizeFurthest rejects negatives and fractions", () => {
  assert.equal(normalizeFurthest(-3, 9), 0);
  assert.equal(normalizeFurthest("-3", 9), 0);
  assert.equal(normalizeFurthest(2.5, 9), 0);
});

test("normalizeFurthest clamps above total", () => {
  assert.equal(normalizeFurthest(12, 9), 9);
  assert.equal(normalizeFurthest("500", 9), 9);
  // Degenerate totals never yield a negative result.
  assert.equal(normalizeFurthest(3, 0), 0);
  assert.equal(normalizeFurthest(3, -1), 0);
});
