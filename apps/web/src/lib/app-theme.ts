/**
 * 应用主题 — 预设色板与明暗模式定义。
 *
 * 16 个预设全部由官方 defineTheme 从单一 accent 派生整套 token
 * （extends neutralTheme），暗色模式交给 <Theme mode> 切换，
 * 二者共同决定最终外观；均通过 localStorage 持久化。
 */
import { defineTheme, type DefinedTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

/** 显示模式：浅色 / 深色 / 跟随系统 */
export type AppThemeMode = "light" | "dark" | "system";

/** 单个预设主题 */
export interface ThemePreset {
  /** 稳定标识（写入 localStorage） */
  id: string;
  /** 中文展示名 */
  label: string;
  /** 该预设的主色（用于色板预览） */
  accent: string;
  /** 由 accent 派生的完整 Astryx 主题 */
  theme: DefinedTheme;
}

/** 主色按指定透明度混入透明，用于派生出跟随主题色的选中/悬停/高亮色 */
function accentMix(percent: number): string {
  return `color-mix(in srgb, var(--color-accent) ${percent}%, transparent)`;
}

function build(id: string, label: string, accent: string): ThemePreset {
  return {
    id,
    label,
    accent,
    theme: defineTheme({
      name: `apollo-${id}`,
      extends: neutralTheme,
      color: { accent },
      tokens: {
        // 页面背景不随预设主题色变化：浅色固定白，仅暗夜改纯黑
        "--color-background-body": ["#ffffff", "#000000"],
        // 选中态底色（原为中性灰，改为随主题色）
        "--color-neutral": [accentMix(12), accentMix(20)],
        // 悬停 / 按压态叠色（原为近中性灰，改为随主题色）
        "--color-overlay-hover": [accentMix(8), accentMix(12)],
        "--color-overlay-pressed": [accentMix(14), accentMix(18)],
        // 选中 / 悬停描边（原为硬编码蓝，改为随主题色）
        "--shadow-inset-hover": `inset 0px 0px 0px 2px ${accentMix(30)}`,
        "--shadow-inset-selected": `inset 0px 0px 0px 2px ${accentMix(55)}`,
      },
      components: {
        // StatusDot 的 accent 变体原为硬编码蓝，改为随主题色
        statusdot: {
          "variant:accent": { backgroundColor: "var(--color-accent)" },
        },
        // ProgressBar 的 accent 变体原为硬编码蓝，改为该预设主色
        progressbar: {
          "variant:accent": { "--color-accent": accent },
        },
      },
    }),
  };
}

export const PRESET_GOLD = build("gold", "鎏金", "#D4A545");
export const PRESET_BLUE = build("blue", "深蓝", "#2F6FE0");
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

/** 16 个预设（顺序即界面展示顺序，鎏金为品牌默认色） */
export const THEME_PRESETS: readonly ThemePreset[] = [
  PRESET_GOLD,
  PRESET_BLUE,
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

export const DEFAULT_PRESET = PRESET_GOLD;
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
const MODE_STORAGE_KEY = "apollo.theme.mode";

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
    const value = localStorage.getItem(MODE_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // 忽略读取失败
  }
  return DEFAULT_MODE;
}

export function writeStoredMode(mode: AppThemeMode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // 忽略写入失败
  }
}
