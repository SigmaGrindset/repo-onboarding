/**
 * Unit tests for the pure part of the chat-history localStorage helpers.
 *
 * Only `capStoredMessages` is exercised — the read/write/clear helpers need a
 * real `localStorage`. Run with `npm test` (which invokes `tsx --test`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import {
  capStoredMessages,
  MAX_STORED_MESSAGES,
  MAX_STORED_BYTES,
} from "../chat-history-local";

/** Minimal UIMessage-shaped object with an optionally padded text part. */
function msg(i: number, pad = 0): UIMessage {
  return {
    id: `m${i}`,
    role: i % 2 === 0 ? "user" : "assistant",
    parts: [{ type: "text", text: "x".repeat(pad) || `msg ${i}` }],
  } as UIMessage;
}

test("capStoredMessages keeps the last MAX_STORED_MESSAGES", () => {
  const many = Array.from({ length: 60 }, (_, i) => msg(i));
  const capped = capStoredMessages(many);
  assert.equal(capped.length, MAX_STORED_MESSAGES);
  // The most recent messages survive; the oldest 10 are dropped.
  assert.equal(capped[0].id, "m10");
  assert.equal(capped[capped.length - 1].id, "m59");
});

test("capStoredMessages returns a small transcript unchanged", () => {
  const few = [msg(0), msg(1), msg(2)];
  const capped = capStoredMessages(few);
  assert.deepEqual(capped, few);
  assert.equal(capped.length, 3);
});

test("capStoredMessages drops oldest until under the byte budget", () => {
  // Ten messages, each padded to ~40 KB, so the whole set (~400 KB) is well
  // over the 200 KB budget and several of the oldest must be dropped.
  const big = Array.from({ length: 10 }, (_, i) => msg(i, 40_000));
  const capped = capStoredMessages(big);
  assert.ok(
    JSON.stringify(capped).length <= MAX_STORED_BYTES,
    "result must fit the byte budget",
  );
  assert.ok(capped.length > 1, "should keep more than one message here");
  assert.ok(capped.length < big.length, "should have dropped some messages");
  // Whatever survives is the newest tail — the last message is always kept.
  assert.equal(capped[capped.length - 1].id, "m9");
});

test("capStoredMessages keeps a single oversize message alone", () => {
  const huge = [msg(0, 10_000), msg(1, MAX_STORED_BYTES + 50_000)];
  const capped = capStoredMessages(huge);
  assert.equal(capped.length, 1, "reduces to the single newest message");
  assert.equal(capped[0].id, "m1");
  assert.ok(
    JSON.stringify(capped).length > MAX_STORED_BYTES,
    "and returns it even though it alone exceeds the budget",
  );
});
