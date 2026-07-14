/**
 * Unit tests for the tour-progress localStorage helpers.
 *
 * Run with `npm test` (which invokes `tsx --test`). `normalizeFurthest` is
 * pure; the read/write/clear helpers run against a minimal in-memory
 * `localStorage` stub installed on `globalThis`.
 */

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  clearLocalTourProgress,
  normalizeFurthest,
  readLocalTourProgress,
  writeLocalTourProgress,
} from "../tour-progress-local";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};

beforeEach(() => store.clear());

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

test("write/read round-trip, keyed per analysis", () => {
  writeLocalTourProgress("a1", 4);
  assert.equal(readLocalTourProgress("a1", 9), 4);
  assert.equal(readLocalTourProgress("a2", 9), 0);
});

test("writeLocalTourProgress never lowers", () => {
  writeLocalTourProgress("a1", 5);
  writeLocalTourProgress("a1", 3);
  assert.equal(readLocalTourProgress("a1", 9), 5);
});

test("writeLocalTourProgress rejects invalid steps", () => {
  writeLocalTourProgress("a1", 0);
  writeLocalTourProgress("a1", -3);
  writeLocalTourProgress("a1", 2.5);
  assert.equal(readLocalTourProgress("a1", 9), 0);
});

test("clearLocalTourProgress removes the key", () => {
  writeLocalTourProgress("a1", 7);
  clearLocalTourProgress("a1");
  assert.equal(readLocalTourProgress("a1", 9), 0);
});

test("clearLocalTourProgress tolerates a missing key", () => {
  assert.doesNotThrow(() => clearLocalTourProgress("never-written"));
});

test("clear then write lands below the old furthest (the reset sequence)", () => {
  writeLocalTourProgress("a1", 9);
  clearLocalTourProgress("a1");
  writeLocalTourProgress("a1", 1);
  assert.equal(readLocalTourProgress("a1", 9), 1);
});
