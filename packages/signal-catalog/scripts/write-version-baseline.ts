import { mkdirSync, writeFileSync } from "node:fs";

import { CATALOG_VERSION, signals } from "../src/index.ts";
import { buildCatalogVersionBaseline } from "../src/versioning.ts";

const fixtureUrl = new URL(
  `../fixtures/parameter-snapshot.${CATALOG_VERSION}.json`,
  import.meta.url,
);
mkdirSync(new URL("../fixtures/", import.meta.url), { recursive: true });
writeFileSync(
  fixtureUrl,
  `${JSON.stringify(buildCatalogVersionBaseline(CATALOG_VERSION, signals), null, 2)}\n`,
  "utf8",
);
