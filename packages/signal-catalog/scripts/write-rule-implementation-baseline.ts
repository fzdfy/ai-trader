import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { CATALOG_VERSION } from "../src/index.ts";
import { hashRuleImplementations } from "../src/rule-hash.ts";

const fixtureUrl = new URL(
  `../fixtures/rule-implementations.${CATALOG_VERSION}.json`,
  import.meta.url,
);
mkdirSync(new URL("../fixtures/", import.meta.url), { recursive: true });
const hash = hashRuleImplementations();
if (existsSync(fixtureUrl)) {
  const existing = JSON.parse(readFileSync(fixtureUrl, "utf8")) as {
    catalogVersion: string;
    implementationHash: string;
  };
  if (
    existing.catalogVersion === CATALOG_VERSION &&
    existing.implementationHash !== hash.implementationHash
  ) {
    throw new Error(
      `rule implementation changed under ${CATALOG_VERSION}; increment CATALOG_VERSION before writing a new baseline`,
    );
  }
}
writeFileSync(
  fixtureUrl,
  `${JSON.stringify(
    {
      catalogVersion: CATALOG_VERSION,
      ...hash,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
