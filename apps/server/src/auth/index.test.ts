import assert from "node:assert/strict";
import test from "node:test";

const configuredOrigins = ["https://public.example", "http://localhost:9080"];
const expectedOrigins = [
  ...configuredOrigins,
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://[::1]:*",
];

process.env.BETTER_AUTH_URL = "https://public.example";
process.env.AUTH_TRUSTED_ORIGINS = configuredOrigins.join(",");

const { auth, createAuth } = await import("./index.ts");

test("Better Auth trusts configured origins plus HTTP loopback ports", () => {
  const configuredAuth = createAuth(process.env);

  assert.deepEqual(configuredAuth.options.trustedOrigins, expectedOrigins);
  assert.deepEqual(auth.options.trustedOrigins, expectedOrigins);
  assert.equal(configuredAuth.options.trustedOrigins?.includes("https://evil.example"), false);
});
