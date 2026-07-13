/**
 * Unit tests for the pure part of the chat quota module (`utcDayKey`).
 *
 * `consumeChatQuota` needs a live Neon database and is intentionally not tested
 * here. Plain `node:test` + `node:assert/strict`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { utcDayKey } from "../chat/quota";

test("utcDayKey: end-of-day UTC keeps the same day", () => {
  assert.equal(utcDayKey(new Date("2026-07-13T23:59:59Z")), "2026-07-13");
});

test("utcDayKey: just past midnight UTC rolls to the next day", () => {
  assert.equal(utcDayKey(new Date("2026-07-14T00:00:01Z")), "2026-07-14");
});
