const EXCHANGES = new Set(["SH", "SZ", "BJ"]);

export function normalizeStockSymbol(input: string): string | null {
  const value = input.trim().toUpperCase();
  const match = value.match(/^(?:(SH|SZ|BJ))?(\d{6})(?:\.(SH|SZ|BJ))?$/);
  if (!match) return null;
  const prefix = match[1];
  const code = match[2]!;
  const suffix = match[3];
  if (prefix && suffix && prefix !== suffix) return null;
  const exchange =
    suffix ??
    prefix ??
    (code.startsWith("6") || code.startsWith("5")
      ? "SH"
      : code.startsWith("4") || code.startsWith("8") || code.startsWith("9")
        ? "BJ"
        : "SZ");
  return EXCHANGES.has(exchange) ? `${code}.${exchange}` : null;
}

export function normalizeCompareSymbols(input: readonly string[]): string[] {
  return [...new Set(input.map(normalizeStockSymbol).filter((value): value is string => !!value))];
}

export function stockAnalysisPath(symbol: string): string {
  return `/home/market/analysis/${encodeURIComponent(symbol)}`;
}

export function stockComparePath(symbols: readonly string[]): string {
  const normalized = normalizeCompareSymbols(symbols);
  return `/home/market/analysis/compare?symbols=${encodeURIComponent(normalized.join(","))}`;
}

export function formatAnalysisMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e8) {
    return `${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1e8)} 亿`;
  }
  if (Math.abs(value) >= 1e4) {
    return `${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1e4)} 万`;
  }
  return new Intl.NumberFormat("zh-CN").format(value);
}

export interface RecentStockAnalysis {
  symbol: string;
  name: string;
  viewedAt: string;
}

export function mergeRecentAnalyses(
  existing: readonly RecentStockAnalysis[],
  latest: RecentStockAnalysis,
  limit = 6,
): RecentStockAnalysis[] {
  return [latest, ...existing.filter((item) => item.symbol !== latest.symbol)]
    .sort((left, right) => Date.parse(right.viewedAt) - Date.parse(left.viewedAt))
    .slice(0, limit);
}
