/**
 * 应用主题 Provider — 持有当前预设色板与显示模式，包裹 Astryx <Theme>。
 *
 * 根级 Theme 会把 data-theme / data-astryx-theme 同步到 <html>，
 * 从而驱动 light-dark() 与 @scope 主题 CSS 生效；选择结果写入 localStorage。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Theme } from "@astryxdesign/core/theme";
import { applyFavicon } from "../lib/favicon";
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

  return (
    <AppThemeContext.Provider value={value}>
      <Theme theme={preset.theme} mode={mode}>
        {children}
      </Theme>
    </AppThemeContext.Provider>
  );
}
