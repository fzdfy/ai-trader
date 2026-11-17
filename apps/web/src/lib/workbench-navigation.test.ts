import assert from "node:assert/strict";
import test from "node:test";
import {
  isDrawerDismissKey,
  WORKBENCH_ACTION_LINKS,
} from "./workbench-navigation.ts";

test("workbench actions cover review, factor iteration, screening, and backtest", () => {
  assert.deepEqual(
    WORKBENCH_ACTION_LINKS.map((item) => item.href),
    [
      "/home/reviews/today",
      "/home/factors/iterate",
      "/home/screens",
      "/home/backtest",
    ],
  );
});

test("drawer dismisses only on Escape", () => {
  assert.equal(isDrawerDismissKey("Escape"), true);
  assert.equal(isDrawerDismissKey("Enter"), false);
});
