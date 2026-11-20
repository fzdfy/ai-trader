import assert from "node:assert/strict";
import test from "node:test";
import {
  readThemeMode,
  resolveThemeMode,
  writeThemeMode,
  type ThemeStorage,
} from "./preline-theme.ts";

test("resolveThemeMode follows explicit light and dark choices", () => {
  assert.equal(resolveThemeMode("light", true), "light");
  assert.equal(resolveThemeMode("dark", false), "dark");
});

test("resolveThemeMode follows system preference", () => {
  assert.equal(resolveThemeMode("system", true), "dark");
  assert.equal(resolveThemeMode("system", false), "light");
});

test("theme mode persists independently from design tokens", () => {
  const values = new Map<string, string>();
  const storage: ThemeStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  writeThemeMode(storage, "dark");

  assert.equal(readThemeMode(storage), "dark");
});

test("invalid stored mode falls back to the prototype light theme", () => {
  const storage: ThemeStorage = {
    getItem: () => "unsupported",
    setItem: () => undefined,
  };

  assert.equal(readThemeMode(storage), "light");
});
