/**
 * 运行时 favicon — 用当前预设主色实时绘制标签图标并写入 <link rel="icon">。
 *
 * 浏览器标签图标是独立文档，读不到页面 CSS 变量 / data-theme，静态 .ico / .png 无法跟随主题；
 * 且页面里存在多个 <link rel="icon"> 时浏览器会自行挑选（往往选中静态 .ico 而忽略主题色）。
 * 这里改为：运行时移除全部静态 icon 链接，用 Canvas 按主色绘制 PNG（全浏览器兼容，含 Safari），
 * 写入唯一的 <link rel="icon" type="image/png">。主色与 <BrandLogo> 同源，暗夜保持同色。
 */
import { BRAND_LOGO_PATH } from "../components/BrandLogo";

const RENDER_SIZE = 128;

function buildPngDataUri(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = RENDER_SIZE;
  canvas.height = RENDER_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(RENDER_SIZE / 100, RENDER_SIZE / 100);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(BRAND_LOGO_PATH), "evenodd");
  return canvas.toDataURL("image/png");
}

/** 将当前主色应用到浏览器标签图标（全浏览器兼容；自动清理静态 icon 链接） */
export function applyFavicon(color: string): void {
  if (typeof document === "undefined") return;
  const href = buildPngDataUri(color);
  if (!href) return;

  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((el) => el.remove());

  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = href;
  document.head.appendChild(link);
}
