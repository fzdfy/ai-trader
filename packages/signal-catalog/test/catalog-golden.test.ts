import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CATALOG_VERSION, signals } from "../src/index.ts";
import { catalogHash, computeDefinitionHash } from "../src/hash.ts";

interface CatalogGoldenFixture {
  catalog_version: string;
  canonicalization: string;
  catalog_hash: string;
  signal_count: number;
  signals: Array<{
    signal_id: string;
    params: Record<string, unknown>;
    definition_hash: string;
  }>;
}

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/catalog.golden.json", import.meta.url), "utf8"),
) as CatalogGoldenFixture;

test("TypeScript catalog matches the cross-language golden fixture", () => {
  assert.equal(fixture.catalog_version, CATALOG_VERSION);
  assert.equal(fixture.canonicalization, "sha256:utf8-json-sorted-keys-v1");
  assert.equal(fixture.signal_count, signals.length);
  assert.equal(fixture.catalog_hash, catalogHash);
  assert.deepEqual(
    signals.map((signal) => ({
      signal_id: signal.signalId,
      params: signal.params,
      definition_hash: computeDefinitionHash(signal),
    })),
    fixture.signals,
  );
});
