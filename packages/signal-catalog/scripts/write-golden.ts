import { mkdirSync, writeFileSync } from "node:fs";

import { goldenCatalogSnapshot } from "../src/hash.ts";

const fixtureUrl = new URL("../fixtures/catalog.golden.json", import.meta.url);
mkdirSync(new URL("../fixtures/", import.meta.url), { recursive: true });
writeFileSync(fixtureUrl, `${JSON.stringify(goldenCatalogSnapshot(), null, 2)}\n`, "utf8");
