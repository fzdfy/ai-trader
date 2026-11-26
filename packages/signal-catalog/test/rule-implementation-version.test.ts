import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { hashRuleImplementations } from "../src/rule-hash.ts";
import { CATALOG_VERSION } from "../src/index.ts";

interface RuleHashFixture {
  catalogVersion: string;
  implementationHash: string;
  files: Record<string, string>;
}

const fixture = JSON.parse(
  readFileSync(
    new URL("../fixtures/rule-implementations.technical-signals-1.0.0.json", import.meta.url),
    "utf8",
  ),
) as RuleHashFixture;

test("formula implementation changes are tied to the catalog release baseline", () => {
  const current = hashRuleImplementations();
  assert.equal(fixture.catalogVersion, CATALOG_VERSION);
  assert.deepEqual(current.files, fixture.files);
  assert.equal(current.implementationHash, fixture.implementationHash);
});
