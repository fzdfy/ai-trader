/** 应用主题 — 预设强调色与明暗模式定义。 */
import {
  readThemeMode,
  writeThemeMode,
  type ThemeMode,
} from "./preline-theme.ts";

/** 显示模式：浅色 / 深色 / 跟随系统 */
export type AppThemeMode = ThemeMode;

/** 单个预设主题 */
export interface ThemePreset {
  /** 稳定标识（写入 localStorage） */
  id: string;
  /** 中文展示名 */
  label: string;
  /** 该预设的主色（用于色板预览） */
  accent: string;
}

function build(id: string, label: string, accent: string): ThemePreset {
  return { id, label, accent };
}

export const PRESET_GOLD = build("gold", "鎏金", "#D4A545");
export const PRESET_BLUE = build("blue", "原始蓝", "#3157E8");
export const PRESET_TEAL = build("teal", "青碧", "#0D9488");
export const PRESET_GREEN = build("green", "翠绿", "#16A34A");
export const PRESET_RED = build("red", "赤焰", "#DC2626");
export const PRESET_ORANGE = build("orange", "暖橙", "#EA580C");
export const PRESET_PURPLE = build("purple", "紫宸", "#7C3AED");
export const PRESET_PINK = build("pink", "绯樱", "#DB2777");
export const PRESET_INDIGO = build("indigo", "靛青", "#4F46E5");
export const PRESET_CYAN = build("cyan", "天青", "#0891B2");
export const PRESET_LIME = build("lime", "青柠", "#65A30D");
export const PRESET_AMBER = build("amber", "琥珀", "#D97706");
export const PRESET_ROSE = build("rose", "玫瑰", "#E11D48");
export const PRESET_BROWN = build("brown", "赭石", "#92643B");
export const PRESET_SLATE = build("slate", "石板", "#475569");
export const PRESET_COBALT = build("cobalt", "钴蓝", "#0B6BB5");

/** 16 个预设（顺序即界面展示顺序，原始蓝为品牌默认色） */
export const THEME_PRESETS: readonly ThemePreset[] = [
  PRESET_BLUE,
  PRESET_GOLD,
  PRESET_TEAL,
  PRESET_GREEN,
  PRESET_RED,
  PRESET_ORANGE,
  PRESET_PURPLE,
  PRESET_PINK,
  PRESET_INDIGO,
  PRESET_CYAN,
  PRESET_LIME,
  PRESET_AMBER,
  PRESET_ROSE,
  PRESET_BROWN,
  PRESET_SLATE,
  PRESET_COBALT,
];

export const DEFAULT_PRESET = PRESET_BLUE;
export const DEFAULT_MODE: AppThemeMode = "system";

/** 按 id 解析预设，未知 id 回退默认预设 */
export function resolvePreset(id: string | null | undefined): ThemePreset {
  if (id) {
    for (const preset of THEME_PRESETS) {
      if (preset.id === id) return preset;
    }
  }
  return DEFAULT_PRESET;
}

/** 显示模式中文名 */
export const MODE_LABELS: Record<AppThemeMode, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};

const PRESET_STORAGE_KEY = "apollo.theme.preset";

export function readStoredPresetId(): string {
  try {
    return localStorage.getItem(PRESET_STORAGE_KEY) ?? DEFAULT_PRESET.id;
  } catch {
    // localStorage 不可用（隐私模式等）时回退默认
    return DEFAULT_PRESET.id;
  }
}

export function writeStoredPresetId(id: string): void {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, id);
  } catch {
    // 忽略写入失败
  }
}

export function readStoredMode(): AppThemeMode {
  try {
    return readThemeMode(localStorage);
  } catch {
    // 忽略读取失败
  }
  return DEFAULT_MODE;
}

export function writeStoredMode(mode: AppThemeMode): void {
  try {
    writeThemeMode(localStorage, mode);
  } catch {
    // 忽略写入失败
  }
}
