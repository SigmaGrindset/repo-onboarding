/**
 * Unit tests for the chat config resolvers.
 *
 * Each case mutates `process.env`, so we snapshot and restore it around every
 * test. Plain `node:test` + `node:assert/strict`, run via `npm test`.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isChatEnabled, chatModelId, chatDailyLimit } from "../chat/config";

const KEYS = [
  "AI_GATEWAY_API_KEY",
  "CHAT_MODEL",
  "CHAT_DAILY_MESSAGE_LIMIT",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("isChatEnabled: false when key unset, empty, or whitespace", () => {
  assert.equal(isChatEnabled(), false);
  process.env.AI_GATEWAY_API_KEY = "";
  assert.equal(isChatEnabled(), false);
  process.env.AI_GATEWAY_API_KEY = "   ";
  assert.equal(isChatEnabled(), false);
});

test("isChatEnabled: true when key is present", () => {
  process.env.AI_GATEWAY_API_KEY = "sk-test";
  assert.equal(isChatEnabled(), true);
});

test("chatModelId: default when unset, override when set", () => {
  assert.equal(chatModelId(), "google/gemini-3-flash");
  process.env.CHAT_MODEL = "anthropic/claude-sonnet-4";
  assert.equal(chatModelId(), "anthropic/claude-sonnet-4");
});

test("chatModelId: blank override falls back to default", () => {
  process.env.CHAT_MODEL = "   ";
  assert.equal(chatModelId(), "google/gemini-3-flash");
});

test("chatDailyLimit: default 30 when unset", () => {
  assert.equal(chatDailyLimit(), 30);
});

test("chatDailyLimit: parses a valid number", () => {
  process.env.CHAT_DAILY_MESSAGE_LIMIT = "50";
  assert.equal(chatDailyLimit(), 50);
});

test("chatDailyLimit: unparseable falls back to 30", () => {
  process.env.CHAT_DAILY_MESSAGE_LIMIT = "abc";
  assert.equal(chatDailyLimit(), 30);
});

test("chatDailyLimit: clamps to min 1 (chosen over falling back to 30)", () => {
  process.env.CHAT_DAILY_MESSAGE_LIMIT = "0";
  assert.equal(chatDailyLimit(), 1);
});

test("chatDailyLimit: clamps to max 1000", () => {
  process.env.CHAT_DAILY_MESSAGE_LIMIT = "99999";
  assert.equal(chatDailyLimit(), 1000);
});
