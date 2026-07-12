// E2E test of the cloud-mode authed flows, using Clerk's test-user convention.
// Run from the repo root:  node scripts/e2e-clerk-test.mjs
//
// What it does (and undoes):
//  1. creates a DISPOSABLE Clerk test user (e2e+clerk_test@example.com)
//  2. mints a short-lived session token — kept in memory only, never persisted
//  3. exercises the app on localhost:3000 as that user:
//       - valid upload  -> expect 201
//       - invalid upload -> expect 400 with schema errors
//       - reading ANOTHER user's analysis -> expect 404 (cross-user isolation)
//       - reading its own analysis        -> expect 200
//       - deleting another user's analysis -> expect 403/404
//       - deleting its own                 -> expect 200
//  4. deletes the test user (finally-block, runs even on failure)
//
// Reads CLERK_SECRET_KEY from web/.env.local. Nothing is written anywhere.

import fs from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const envFile = path.join(root, "..", "web", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const SK = env.CLERK_SECRET_KEY;
if (!SK) { console.error("CLERK_SECRET_KEY not found in web/.env.local"); process.exit(2); }

const API = "https://api.clerk.com/v1";
const APP = "http://localhost:3000";
const hdr = { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };

// The analysis uploaded by the real (owner) account — used for isolation tests.
const OWNERS_ANALYSIS = "db_13503559-2b13-4ac4-a1c2-9ee52d654016";

let pass = 0, fail = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  ok ? pass++ : fail++;
}

const uRes = await fetch(`${API}/users`, {
  method: "POST", headers: hdr,
  body: JSON.stringify({ email_address: ["e2e+clerk_test@example.com"], skip_password_requirement: true }),
});
const user = await uRes.json();
if (!user.id) { console.error("user create failed:", JSON.stringify(user)); process.exit(1); }
console.log("test user created:", user.id);

try {
  const sRes = await fetch(`${API}/sessions`, { method: "POST", headers: hdr, body: JSON.stringify({ user_id: user.id }) });
  const session = await sRes.json();
  if (!session.id) throw new Error("session create failed: " + JSON.stringify(session));
  const tRes = await fetch(`${API}/sessions/${session.id}/tokens`, { method: "POST", headers: hdr, body: JSON.stringify({ expires_in_seconds: 300 }) });
  const tok = await tRes.json();
  if (!tok.jwt) throw new Error("token mint failed: " + JSON.stringify(tok));
  const authz = { Authorization: `Bearer ${tok.jwt}` };
  console.log("session token minted (in-memory, 5 min TTL)\n");

  // valid upload
  const payload = fs.readFileSync(path.join(root, "..", "data", "sample", "analysis.json"), "utf8");
  let r = await fetch(`${APP}/api/analyses`, { method: "POST", headers: { ...authz, "Content-Type": "application/json" }, body: payload });
  const up = await r.json();
  check("valid upload returns 201", r.status === 201, `status ${r.status}, id ${up.id ?? "none"}`);
  const myId = up.id;

  // invalid upload
  r = await fetch(`${APP}/api/analyses`, { method: "POST", headers: { ...authz, "Content-Type": "application/json" }, body: JSON.stringify({ schemaVersion: "1.0.0" }) });
  const bad = await r.json();
  check("invalid upload returns 400 with errors", r.status === 400 && Array.isArray(bad.errors), `status ${r.status}, ${bad.errors?.length ?? 0} errors`);

  // cross-user isolation
  r = await fetch(`${APP}/analysis/${OWNERS_ANALYSIS}`, { headers: authz, redirect: "manual" });
  check("cannot read another user's analysis (404)", r.status === 404, `status ${r.status}`);

  if (myId) {
    r = await fetch(`${APP}/analysis/${myId}`, { headers: authz, redirect: "manual" });
    check("can read own analysis (200)", r.status === 200, `status ${r.status}`);
  }

  // delete: someone else's, then own
  r = await fetch(`${APP}/api/analyses/${OWNERS_ANALYSIS}`, { method: "DELETE", headers: authz });
  check("cannot delete another user's analysis (403/404)", r.status === 403 || r.status === 404, `status ${r.status}`);

  if (myId) {
    r = await fetch(`${APP}/api/analyses/${myId}`, { method: "DELETE", headers: authz });
    check("can delete own analysis (200)", r.status === 200, `status ${r.status}`);
  }
} finally {
  const dRes = await fetch(`${API}/users/${user.id}`, { method: "DELETE", headers: hdr });
  console.log(`\ntest user deleted: HTTP ${dRes.status}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
