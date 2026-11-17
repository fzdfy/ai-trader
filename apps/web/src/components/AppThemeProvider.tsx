/** 应用主题 Provider — 持有当前预设强调色与明暗模式。 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { applyFavicon } from "../lib/favicon";
import { resolveThemeMode } from "../lib/preline-theme";
import {
  readStoredMode,
  readStoredPresetId,
  resolvePreset,
  writeStoredMode,
  writeStoredPresetId,
  type AppThemeMode,
  type ThemePreset,
} from "../lib/app-theme";

interface AppThemeContextValue {
  /** 当前预设主题 */
  preset: ThemePreset;
  /** 当前显示模式 */
  mode: AppThemeMode;
  /** 切换预设主题（自动持久化） */
  setPresetId: (id: string) => void;
  /** 切换显示模式（自动持久化） */
  setMode: (mode: AppThemeMode) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

/** 读取/设置应用主题；必须在 AppThemeProvider 内使用 */
export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error("useAppTheme 必须在 AppThemeProvider 内使用");
  return ctx;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [presetId, setPresetIdState] = useState<string>(readStoredPresetId);
  const [mode, setModeState] = useState<AppThemeMode>(readStoredMode);

  const preset = useMemo(() => resolvePreset(presetId), [presetId]);

  /** 标签图标跟随预设主色（静态 .ico/.png 无法跟随主题，故运行时用主色重绘 PNG） */
  useEffect(() => {
    applyFavicon(preset.accent);
  }, [preset.accent]);

  useEffect(() => {
    const media = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = resolveThemeMode(mode, media.matches);
      document.documentElement.classList.toggle("dark", resolved === "dark");
      document.documentElement.dataset.prelineTheme = `theme-${preset.id}`;
      document.documentElement.style.colorScheme = resolved;
      document.documentElement.style.setProperty("--primary", preset.accent);
      document.documentElement.style.setProperty(
        "--primary-hover",
        `color-mix(in srgb, ${preset.accent} 86%, black)`,
      );
      document.documentElement.style.setProperty(
        "--primary-active",
        `color-mix(in srgb, ${preset.accent} 74%, black)`,
      );
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode, preset.accent, preset.id]);

  const setPresetId = useCallback((id: string) => {
    setPresetIdState(id);
    writeStoredPresetId(id);
  }, []);

  const setMode = useCallback((next: AppThemeMode) => {
    setModeState(next);
    writeStoredMode(next);
  }, []);

  const value = useMemo<AppThemeContextValue>(
    () => ({ preset, mode, setPresetId, setMode }),
    [preset, mode, setPresetId, setMode],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}
