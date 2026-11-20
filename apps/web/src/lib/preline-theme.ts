export type ThemeMode = "light" | "dark" | "system";

export interface ThemeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const THEME_MODE_STORAGE_KEY = "apollo.theme.mode";

export function resolveThemeMode(
  mode: ThemeMode,
  prefersDark: boolean,
): "light" | "dark" {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemeMode(storage: Pick<ThemeStorage, "getItem">): ThemeMode {
  const value = storage.getItem(THEME_MODE_STORAGE_KEY);
  return isThemeMode(value) ? value : "light";
}

export function writeThemeMode(
  storage: Pick<ThemeStorage, "setItem">,
  mode: ThemeMode,
): void {
  storage.setItem(THEME_MODE_STORAGE_KEY, mode);
}
