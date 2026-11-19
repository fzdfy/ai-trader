import type { CSSProperties } from "react";

export type SpacingStep =
  | 0
  | 0.5
  | 1
  | 1.5
  | 2
  | 3
  | 4
  | 5
  | 6
  | 8
  | 10;

export type StackAlignment =
  | "start"
  | "center"
  | "end"
  | "stretch"
  | "between"
  | "around"
  | "evenly";

type SizeValue = number | string;

const SPACING: Record<SpacingStep, string> = {
  0: "0",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
};

const ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

const JUSTIFY: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
};

function spacing(value: SpacingStep | undefined): string | undefined {
  return value == null ? undefined : SPACING[value];
}

function size(value: SizeValue | undefined): string | undefined {
  return typeof value === "number" ? `${value}px` : value;
}

export interface StackOptions {
  direction?: "horizontal" | "vertical";
  hAlign?: StackAlignment;
  vAlign?: StackAlignment;
  justify?: StackAlignment;
  align?: StackAlignment;
  gap?: SpacingStep;
  padding?: SpacingStep;
  paddingInline?: SpacingStep;
  paddingBlock?: SpacingStep;
  width?: SizeValue;
  height?: SizeValue;
  maxWidth?: SizeValue;
  minHeight?: SizeValue;
  wrap?: "nowrap" | "wrap" | "wrap-reverse";
  isScrollable?: boolean;
}

export function stackStyle({
  direction = "vertical",
  hAlign,
  vAlign,
  justify,
  align,
  gap,
  padding,
  paddingInline,
  paddingBlock,
  width,
  height,
  maxWidth,
  minHeight,
  wrap = "nowrap",
  isScrollable,
}: StackOptions): CSSProperties {
  const horizontal = direction === "horizontal";
  const main = horizontal ? (justify ?? hAlign) : (justify ?? vAlign);
  const cross = horizontal ? (align ?? vAlign) : (align ?? hAlign);

  const flexWrap =
    wrap === "wrap" ? "wrap" : wrap === "wrap-reverse" ? "wrap-reverse" : undefined;

  return {
    display: "flex",
    flexDirection: horizontal ? "row" : "column",
    ...(gap != null ? { gap: spacing(gap) } : {}),
    ...(cross ? { alignItems: ALIGN[cross] } : {}),
    ...(main ? { justifyContent: JUSTIFY[main] } : {}),
    ...(flexWrap ? { flexWrap } : {}),
    ...(isScrollable ? { overflow: "auto" } : {}),
    ...(padding != null ? { padding: spacing(padding) } : {}),
    ...(paddingInline != null ? { paddingInline: spacing(paddingInline) } : {}),
    ...(paddingBlock != null ? { paddingBlock: spacing(paddingBlock) } : {}),
    ...(width != null ? { width: size(width) } : {}),
    ...(height != null ? { height: size(height) } : {}),
    ...(maxWidth != null ? { maxWidth: size(maxWidth) } : {}),
    ...(minHeight != null ? { minHeight: size(minHeight) } : {}),
  };
}

export interface ButtonClassOptions {
  variant?: string;
  size?: "sm" | "md" | "lg";
  isDisabled?: boolean;
  isLoading?: boolean;
}

const BUTTON_VARIANTS: Record<string, string> = {
  primary: "border border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-app-line bg-app-panel text-app-ink hover:bg-app-surface",
  ghost: "border border-transparent bg-transparent text-app-muted hover:bg-app-surface hover:text-app-ink",
  destructive: "border border-destructive bg-destructive text-white hover:opacity-90",
  neutral: "border border-app-line bg-app-surface text-app-ink hover:bg-app-panel",
};

const BUTTON_SIZES = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-4 text-sm",
  lg: "h-10 gap-2 px-5 text-sm",
} as const;

export function buttonClassNames({
  variant = "secondary",
  size = "md",
  isDisabled,
  isLoading,
}: ButtonClassOptions): string {
  return [
    "focus-ring inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition",
    BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.secondary,
    BUTTON_SIZES[size],
    isDisabled || isLoading ? "pointer-events-none cursor-not-allowed opacity-60" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const BADGE_VARIANTS: Record<string, string> = {
  neutral: "bg-app-surface text-app-muted",
  default: "bg-primary/10 text-app-ink",
  success: "bg-app-success-soft text-app-success",
  warning: "bg-app-warning-soft text-app-ink",
  error: "bg-destructive/10 text-destructive",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-primary/10 text-app-ink",
  blue: "bg-primary/10 text-app-ink",
  accent: "bg-primary/10 text-app-ink",
};

export function badgeClassNames(variant = "neutral"): string {
  return [
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
    BADGE_VARIANTS[variant] ?? BADGE_VARIANTS.neutral,
  ].join(" ");
}

export function sortRowsByKey<T extends Record<string, unknown>>(
  rows: readonly T[],
  key: keyof T,
  direction: "asc" | "desc",
  comparator?: (a: T, b: T) => number,
): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return rows.toSorted((a, b) => {
    if (comparator) return comparator(a, b) * factor;
    return String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "zh-CN") * factor;
  });
}
