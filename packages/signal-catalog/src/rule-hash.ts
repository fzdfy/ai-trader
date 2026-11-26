import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RULE_IMPLEMENTATION_FILES = [
  "apps/quant/technical_signals/engine.py",
  "apps/quant/technical_signals/patterns.py",
  "apps/quant/technical_signals/microstructure.py",
  "apps/quant/technical_signals/snapshot.py",
  "apps/server/src/lib/technical-signals/advanced.ts",
] as const;

export const hashRuleImplementations = (rootDir = resolve(import.meta.dirname, "../../..")) => {
  const files = Object.fromEntries(
    RULE_IMPLEMENTATION_FILES.map((file) => {
      const content = readFileSync(resolve(rootDir, file));
      return [file, createHash("sha256").update(content).digest("hex")];
    }),
  );
  const implementationHash = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  return { implementationHash, files };
};
