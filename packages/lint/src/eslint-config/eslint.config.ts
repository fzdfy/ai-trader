import tseslint from "typescript-eslint";
import eslintPluginUnicorn from "eslint-plugin-unicorn";

export default tseslint.config(
  {
    ignores: ["dist/", ".turbo/", "node_modules/", "migrations/"],
  },
  eslintPluginUnicorn.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        // oxlint 已覆盖 type-aware 检查，eslint 补充 unicorn + 语法规则
      },
      sourceType: "module",
    },
  },
  {
    rules: {
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "unicorn/filename-case": "off",
    },
  },
);
