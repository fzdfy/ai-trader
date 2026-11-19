import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatedCatalog } from "../src/lib/data-governance/generate-docs.ts";
import { checkGovernanceSchema } from "../src/lib/data-governance/schema-drift.ts";

const catalogPath = resolve("../../docs/data-governance/catalog.md");

async function main() {
  const drift = await checkGovernanceSchema();
  const catalog = readFileSync(catalogPath, "utf8");
  const catalogDrift = catalog !== generatedCatalog();
  if (drift.missing.length === 0 && drift.extra.length === 0 && !catalogDrift) {
    console.log("governance registry and catalog are current");
    return;
  }
  if (drift.missing.length > 0) {
    console.error(`missing governance assets: ${drift.missing.join(", ")}`);
  }
  if (drift.extra.length > 0) {
    console.error(`stale governance assets: ${drift.extra.join(", ")}`);
  }
  if (catalogDrift) {
    console.error("docs/data-governance/catalog.md is stale");
  }
  process.exitCode = 1;
}

void main();
