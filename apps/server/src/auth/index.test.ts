import assert from "node:assert/strict";
import test from "node:test";

const expectedOrigins = ["https://ouzq6euvec18.shares.zrok.io", "http://localhost:9080"];

process.env.BETTER_AUTH_URL = "https://ouzq6euvec18.shares.zrok.io";
process.env.AUTH_TRUSTED_ORIGINS = expectedOrigins.join(",");

const { auth, createAuth } = await import("./index.ts");

test("Better Auth trusts only the configured origin allowlist", () => {
  const configuredAuth = createAuth(process.env);

  assert.deepEqual(configuredAuth.options.trustedOrigins, expectedOrigins);
  assert.deepEqual(auth.options.trustedOrigins, expectedOrigins);
  assert.equal(configuredAuth.options.trustedOrigins?.includes("https://evil.example"), false);
});
