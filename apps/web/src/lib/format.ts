/** 格式化资金额：亿 / 万 / 元（带正负号） */
export function fmtFlow(v: number | null): string {
  if (v == null) return "-";
  const abs = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}万`;
  return `${sign}${abs.toFixed(0)}`;
}

/** 东财股票代码 → 标准 symbol（如 600519 → 600519.SH） */
export function toSymbol(code: string): string {
  if (/^(60|68)/.test(code)) return `${code}.SH`;
  if (/^(00|30)/.test(code)) return `${code}.SZ`;
  if (/^(43|83|87|92)/.test(code)) return `${code}.BJ`;
  return `${code}.SH`;
}
