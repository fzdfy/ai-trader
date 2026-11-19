import assert from "node:assert/strict";
import test from "node:test";
import {
  getSyncDependency,
  validateRetryCandidate,
} from "./sync-retry.ts";

test("allows a failed registered module when nothing else is running", () => {
  assert.deepEqual(
    validateRetryCandidate("boards", { status: "failed" }, []),
    { allowed: true },
  );
});

test("rejects successful, running and unknown modules", () => {
  assert.equal(
    validateRetryCandidate("boards", { status: "success" }, []).allowed,
    false,
  );
  assert.equal(
    validateRetryCandidate("boards", { status: "failed" }, ["kline-1d"])
      .allowed,
    false,
  );
  assert.equal(
    validateRetryCandidate("not-a-module", { status: "failed" }, []).allowed,
    false,
  );
});

test("rejects a dependency retry until its upstream succeeded", () => {
  assert.equal(
    validateRetryCandidate("adj-factor", { status: "failed" }, [], "failed")
      .allowed,
    false,
  );
  assert.equal(
    validateRetryCandidate("adj-factor", { status: "failed" }, [], "success")
      .allowed,
    true,
  );
});

test("exposes the registered dependency chain for the sync table", () => {
  assert.equal(getSyncDependency("adj-factor"), "kline-1d");
  assert.equal(getSyncDependency("kline-period"), "adj-factor");
  assert.equal(getSyncDependency("boards"), null);
});
