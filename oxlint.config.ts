import oxcConfig from "@ai-trader/eslint-config/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  ...oxcConfig,
  ignorePatterns: [
    ...(oxcConfig.ignorePatterns ?? []),
    "dist",
    ".turbo",
    "node_modules",
    "migrations",
  ],
});
