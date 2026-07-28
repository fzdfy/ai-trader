import esLintConfig from "@ai-trader/eslint-config";

export default [
  ...esLintConfig,
  { ignores: ["dist", ".turbo", "node_modules"] },
];
