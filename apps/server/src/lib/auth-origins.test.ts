import assert from "node:assert/strict";
import test from "node:test";
import { parseTrustedOrigins, resolveCorsOrigin } from "./auth-origins.ts";

test("normalizes configured trusted origins deterministically", () => {
  assert.deepEqual(
    parseTrustedOrigins(
      " https://ouzq6euvec18.shares.zrok.io/, http://localhost:9080, https://ouzq6euvec18.shares.zrok.io ",
      undefined,
    ),
    ["https://ouzq6euvec18.shares.zrok.io", "http://localhost:9080"],
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
  ]);
  assert.deepEqual(parseTrustedOrigins("   ", undefined), ["http://localhost:9080"]);
});

test("only allows an origin present in the exact allowlist", () => {
  const allowed = new Set(["https://ouzq6euvec18.shares.zrok.io", "http://localhost:9080"]);

  assert.equal(
    resolveCorsOrigin("https://ouzq6euvec18.shares.zrok.io", allowed),
    "https://ouzq6euvec18.shares.zrok.io",
  );
  assert.equal(resolveCorsOrigin("https://evil.example", allowed), null);
  assert.equal(resolveCorsOrigin(undefined, allowed), null);
});
