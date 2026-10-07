/**
 * 品牌标识 — 内联 SVG（圆形 + 四柱镂空）。
 *
 * 颜色由外部传入预设主色（preset.accent 的原始 hex），
 * 因此会跟随主题色切换，但不随明暗模式翻转（暗夜下保持同色）。
 */
interface BrandLogoProps {
  /** 图形颜色（取预设 accent 原始 hex，不随明暗翻转） */
  color: string;
  /** 渲染边长，默认 36 */
  size?: number;
}

/** 品牌图形路径（圆形 + 四柱镂空），供 logo 与 favicon 共用 */
export const BRAND_LOGO_PATH =
  "M 50 1 a 49 49 0 1 0 0.01 0 Z M 21 47 h 8.5 v 31 h -8.5 Z M 38 56 h 8.5 v 22 h -8.5 Z M 54 28 h 8.5 v 50 h -8.5 Z M 71 36 h 8.5 v 42 h -8.5 Z";

export function BrandLogo({ color, size = 36 }: BrandLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="Apollo Quant"
      style={{ display: "block" }}
    >
      <path
        fill={color}
        fillRule="evenodd"
        d={BRAND_LOGO_PATH}
      />
    </svg>
  );
}
