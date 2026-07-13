/**
 * Unit tests for the database-free token format helpers (`@/lib/token-format`).
 *
 * These cover the security-critical pure logic: token generation shape, syntax
 * validation, hash stability, display prefix, Authorization-header parsing, and
 * name normalization. Plain `node:test` + `node:assert/strict`, run via
 * `npm test`. No database is touched.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  TOKEN_RE,
  TOKEN_NAME_MAX_LEN,
  generateToken,
  isValidTokenFormat,
  hashToken,
  tokenDisplayPrefix,
  parseBearerToken,
  normalizeTokenName,
} from "../token-format";

test("generateToken: matches the roa_+40-hex syntax", () => {
  for (let i = 0; i < 100; i++) {
    const t = generateToken();
    assert.match(t, TOKEN_RE);
    assert.equal(t.length, 44); // "roa_" (4) + 40 hex
    assert.ok(t.startsWith("roa_"));
  }
});

test("generateToken: produces distinct values", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(generateToken());
  assert.equal(seen.size, 1000);
});

test("isValidTokenFormat: accepts only canonical tokens", () => {
  assert.equal(isValidTokenFormat(generateToken()), true);
  assert.equal(isValidTokenFormat("roa_" + "a".repeat(40)), true);
  // Wrong prefix, wrong length, uppercase hex, non-hex, whitespace, empty.
  assert.equal(isValidTokenFormat("rob_" + "a".repeat(40)), false);
  assert.equal(isValidTokenFormat("roa_" + "a".repeat(39)), false);
  assert.equal(isValidTokenFormat("roa_" + "a".repeat(41)), false);
  assert.equal(isValidTokenFormat("roa_" + "A".repeat(40)), false);
  assert.equal(isValidTokenFormat("roa_" + "g".repeat(40)), false);
  assert.equal(isValidTokenFormat("roa_" + "a".repeat(40) + " "), false);
  assert.equal(isValidTokenFormat(""), false);
  assert.equal(isValidTokenFormat("roa_"), false);
});

test("hashToken: stable sha256 hex, matches node:crypto", () => {
  const t = "roa_" + "1234567890abcdef".repeat(2) + "12345678";
  const expected = createHash("sha256").update(t).digest("hex");
  assert.equal(hashToken(t), expected);
  // Deterministic across calls, 64 hex chars.
  assert.equal(hashToken(t), hashToken(t));
  assert.match(hashToken(t), /^[0-9a-f]{64}$/);
  // Different plaintext → different hash.
  assert.notEqual(hashToken(t), hashToken(t + "0"));
});

test("tokenDisplayPrefix: first 12 chars (roa_ + 8 hex)", () => {
  const t = "roa_3f9a02c1" + "b".repeat(32);
  assert.equal(tokenDisplayPrefix(t), "roa_3f9a02c1");
  assert.equal(tokenDisplayPrefix(t).length, 12);
});

test("token round-trip: generate → valid → hash stable → prefix", () => {
  const t = generateToken();
  assert.equal(isValidTokenFormat(t), true);
  const h1 = hashToken(t);
  const h2 = hashToken(t);
  assert.equal(h1, h2);
  assert.equal(tokenDisplayPrefix(t), t.slice(0, 12));
});

test("parseBearerToken: extracts a valid bearer token", () => {
  const t = generateToken();
  assert.equal(parseBearerToken(`Bearer ${t}`), t);
  assert.equal(parseBearerToken(`bearer ${t}`), t); // scheme case-insensitive
  assert.equal(parseBearerToken(`BEARER ${t}`), t);
  assert.equal(parseBearerToken(`Bearer   ${t}`), t); // extra spaces
  assert.equal(parseBearerToken(t), t); // bare token
  assert.equal(parseBearerToken(`  ${t}  `), t); // surrounding whitespace
});

test("parseBearerToken: rejects missing / malformed / wrong-scheme / garbage", () => {
  const t = generateToken();
  assert.equal(parseBearerToken(null), null);
  assert.equal(parseBearerToken(undefined), null);
  assert.equal(parseBearerToken(""), null);
  assert.equal(parseBearerToken("   "), null);
  assert.equal(parseBearerToken("Bearer"), null);
  assert.equal(parseBearerToken("Bearer "), null);
  assert.equal(parseBearerToken(`Basic ${t}`), null); // wrong scheme
  assert.equal(parseBearerToken(`Bearer not-a-token`), null);
  assert.equal(parseBearerToken(`Bearer roa_${"z".repeat(40)}`), null); // non-hex
  assert.equal(parseBearerToken("just some garbage"), null);
  assert.equal(parseBearerToken(`Bearer ${t} extra`), null); // trailing junk
});

test("normalizeTokenName: trims, rejects empty, caps length", () => {
  assert.equal(normalizeTokenName("  laptop CLI  "), "laptop CLI");
  assert.equal(normalizeTokenName("ci"), "ci");
  assert.equal(normalizeTokenName(""), null);
  assert.equal(normalizeTokenName("   "), null);
  assert.equal(normalizeTokenName(123), null);
  assert.equal(normalizeTokenName(null), null);
  assert.equal(normalizeTokenName(undefined), null);
  const long = "x".repeat(200);
  assert.equal(normalizeTokenName(long)?.length, TOKEN_NAME_MAX_LEN);
});
