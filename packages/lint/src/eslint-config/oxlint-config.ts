import { defineConfig } from "oxlint";
import { notDefaultInOxlint } from "./scripts/eslint-not-oxlint-default.js";

export default defineConfig({
  plugins: ["typescript", "unicorn", "react", "import", "promise"],
  categories: {
    correctness: "error",
  },
  env: {
    builtin: true,
    es2025: true,
    node: true,
    browser: true,
  },
  ignorePatterns: [
    "routeTree.gen.ts",
    "types",
    "dist",
    ".turbo",
    "node_modules",
    "migrations",
  ],
  rules: {
    // import rules
    "import/consistent-type-specifier-style": "error",
    "import/no-duplicates": "error",
    "import/no-empty-named-blocks": "error",
    "import/no-default-export": "off",
    // code style (let oxfmt handle formatting, not lint)
    "object-shorthand": "error",
    "prefer-template": "error",
    // react rules
    "react/button-has-type": "error",
    "react/jsx-boolean-value": "error",
    "react/jsx-curly-brace-presence": "error",
    "react/jsx-no-comment-textnodes": "error",
    "react/jsx-no-useless-fragment": "error",
    "react/no-array-index-key": "error",
    "react/no-danger": "error",
    "react/self-closing-comp": "error",
    // rules not in oxlint defaults
    ...notDefaultInOxlint,
    // Per-project relaxations
    "unicorn/filename-case": "off",
    "unicorn/no-null": "off",
    "typescript/no-explicit-any": "warn",
  },
});
