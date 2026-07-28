import { defineConfig } from "oxfmt";

export default defineConfig({
  indent: { width: 2 },
  lineWidth: 100,
  semicolons: "always",
  quoteStyle: "double",
  trailingCommas: "all",
  ignorePatterns: ["**/dist/**", "**/migrations/**", "**/.turbo/**"],
  sortImports: false,
});
