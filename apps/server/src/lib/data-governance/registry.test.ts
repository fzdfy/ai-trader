import assert from "node:assert/strict";
import test from "node:test";
import { DATA_CENTER_TABLES } from "../../api/data-center.ts";
import {
  GOVERNANCE_ASSETS,
  getGovernanceAsset,
} from "./registry.ts";
import { generatedCatalog } from "./generate-docs.ts";
import { validateGovernanceRegistry } from "./validation.ts";

test("governance registry is valid and unique", () => {
  assert.deepEqual(validateGovernanceRegistry(GOVERNANCE_ASSETS), []);
  assert.equal(
    new Set(GOVERNANCE_ASSETS.map((asset) => asset.key)).size,
    GOVERNANCE_ASSETS.length,
  );
});

test("governance registry covers every deployed data-center table", () => {
  for (const definition of DATA_CENTER_TABLES) {
    assert.ok(
      getGovernanceAsset(definition.table),
      `missing governance asset for ${definition.table}`,
    );
  }
});

test("generated catalog is deterministic and exposes tier zero lineage", () => {
  const first = generatedCatalog();
  assert.equal(first, generatedCatalog());
  assert.match(first, /bar1d_raw/);
  assert.match(first, /tier_0/);
  assert.match(first, /a-stock-data/);
  assert.match(first, /Data Steward/);
});
