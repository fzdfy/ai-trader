import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PRESET } from "./app-theme.ts";

test("default theme is the original PULSE blue without a component-library runtime", () => {
  assert.equal(DEFAULT_PRESET.id, "blue");
  assert.equal(DEFAULT_PRESET.accent, "#3157E8");
  assert.equal("theme" in DEFAULT_PRESET, false);
});
