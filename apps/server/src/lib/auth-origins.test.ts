import assert from "node:assert/strict";
import test from "node:test";
import { parseTrustedOrigins, resolveCorsOrigin } from "./auth-origins.ts";

const loopbackPatterns = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://[::1]:*",
];

test("normalizes configured trusted origins deterministically", () => {
  assert.deepEqual(
    parseTrustedOrigins(
      " https://public.example/, http://localhost:9080, https://public.example ",
      undefined,
    ),
    ["https://public.example", "http://localhost:9080", ...loopbackPatterns],
  );
});

test("rejects malformed and unsupported trusted origins", () => {
  assert.throws(() => parseTrustedOrigins("ftp://example.com", undefined), /trusted origin/i);
  assert.throws(() => parseTrustedOrigins("not-an-origin", undefined), /trusted origin/i);
});

test("falls back to the auth base URL and local UI origin", () => {
  assert.deepEqual(parseTrustedOrigins(undefined, "http://localhost:3001"), [
    "http://localhost:3001",
    "http://localhost:9080",
    ...loopbackPatterns,
  ]);
  assert.deepEqual(parseTrustedOrigins("   ", undefined), [
    "http://localhost:9080",
    ...loopbackPatterns,
  ]);
});

test("allows exact origins and any localhost loopback port", () => {
  const allowed = new Set(["https://public.example", ...loopbackPatterns]);

  assert.equal(resolveCorsOrigin("https://public.example", allowed), "https://public.example");
  assert.equal(resolveCorsOrigin("http://localhost:9080", allowed), "http://localhost:9080");
  assert.equal(resolveCorsOrigin("http://localhost:5173", allowed), "http://localhost:5173");
  assert.equal(resolveCorsOrigin("http://127.0.0.1:9080", allowed), "http://127.0.0.1:9080");
  assert.equal(resolveCorsOrigin("http://[::1]:9080", allowed), "http://[::1]:9080");
});

test("rejects LAN, lookalike and non-loopback origins", () => {
  const allowed = new Set(["https://public.example", ...loopbackPatterns]);

  assert.equal(resolveCorsOrigin("https://evil.example", allowed), null);
  assert.equal(resolveCorsOrigin("http://192.168.1.10:9080", allowed), null);
  assert.equal(resolveCorsOrigin("http://localhost.evil.example:9080", allowed), null);
  assert.equal(resolveCorsOrigin(undefined, allowed), null);
});
