export type MarketCenterTab = "overview" | "boards" | "stocks";
export type RotationScope =
  | "growth-defense"
  | "industry"
  | "concept"
  | "asset"
  | "main-benchmark";
export type RotationWindow = "5D" | "20D" | "60D";
export type MarketSectionStatus = "available" | "low" | "missing" | "error";
export const MARKET_PAGE_SIZE = 10;

export interface MarketCenterTabDefinition {
  key: MarketCenterTab;
  label: string;
  href: "/home/market" | "/home/market/boards" | "/home/market/stock";
}

export const MARKET_CENTER_TABS: readonly MarketCenterTabDefinition[] = [
  { key: "overview", label: "总览", href: "/home/market" },
  { key: "boards", label: "板块", href: "/home/market/boards" },
  { key: "stocks", label: "个股", href: "/home/market/stock" },
] as const;

export interface MarketRotationRow {
  code: string;
  name: string;
  relativeReturn: number | null;
  rank: number | null;
  rankChange: number | null;
  moneyConfirmation: number | null;
  limitUpConcentration: number | null;
  phase: "加速" | "扩散" | "放缓" | "修复" | "退潮" | "稳定" | "数据不足";
  quality: MarketSectionStatus;
}

export interface GrowthDefenseRotation {
  current: {
    value: number;
    state: "低区" | "中间区" | "高区";
    percentile1500d: number | null;
    relativeReturn20d: number | null;
    thresholdLow: number;
    thresholdHigh: number;
    asOf: string | null;
    quality: MarketSectionStatus;
  };
  series: Array<{ date: string; value: number }>;
}

export interface MarketRotationResponse {
  scope: RotationScope;
  window: RotationWindow;
  asOf: string | null;
  status: MarketSectionStatus;
  rows: MarketRotationRow[];
  growthDefense: GrowthDefenseRotation | null;
  benchmark: {
    code: string;
    name: string;
    returnPct: number | null;
  } | null;
  validStyleCount: number;
  errors: Array<{ section: string; message: string }>;
}

export interface MainIndexItem {
  code: string;
  name: string;
  role: "市场基准" | "大盘核心" | "中盘成长" | "小盘成长" | "成长进攻" | "科技成长" | "防御价值";
  isBenchmark: boolean;
  price: number | null;
  changePct: number | null;
  priceUnit: string;
  asOf: string | null;
  source: "tencent" | "quote_latest" | "csindex" | "none";
  quality: MarketSectionStatus;
  staleReason: string | null;
  trend: Array<{ date: string; value: number }>;
}

export interface MainIndexSection {
  status: MarketSectionStatus;
  asOf: string | null;
  items: MainIndexItem[];
  errors: Array<{ section: string; message: string }>;
}

export interface MarketCenterOverviewResponse {
  generatedAt: string;
  asOf: {
    quotes: string | null;
    boards: string | null;
    fundFlow: string | null;
    limitUp: string | null;
    growthDefense: string | null;
    mainIndices: string | null;
  };
  quotes: Array<{
    symbol: string;
    name: string;
    price: number | null;
    changePct: number | null;
    priceUnit: string;
    asOf: string | null;
    source: string;
    quality: MarketSectionStatus;
    staleReason: string | null;
  }>;
  breadth: {
    status: MarketSectionStatus;
    industry: { total: number; rising: number; falling: number; flat: number };
    concept: { total: number; rising: number; falling: number; flat: number };
    asOf: string | null;
  };
  limitUp: {
    status: MarketSectionStatus;
    total: number;
    maxBoard: number;
    maxSealAmount: number;
    avgTurnover: number;
    openedCount: number;
    ladder: Array<{ count: number; names: string[] }>;
    leaders: Array<{
      symbol: string;
      name: string;
      industry: string | null;
      count: number;
    }>;
    asOf: string | null;
  };
  anomalies: {
    status: MarketSectionStatus;
    items: Array<{
      ruleId: string;
      title: string;
      evidence: string;
      category: "industry" | "concept" | "limit_up";
      asOf: string;
      href: string;
    }>;
    asOf: string | null;
  };
  growthDefense: MarketRotationResponse;
  mainIndices: MainIndexSection;
  errors: Array<{ section: string; message: string }>;
}

export function marketCenterTabForPath(pathname: string): MarketCenterTab {
  if (pathname.startsWith("/home/market/boards")) return "boards";
  if (pathname.startsWith("/home/market/stock")) return "stocks";
  return "overview";
}

export function boardDetailPath(code: string, type: "industry" | "concept"): string {
  return `/home/market/boards/${encodeURIComponent(code)}?type=${type}`;
}

export function legacyMarketRedirect(
  pathname: string,
  search: Record<string, unknown>,
): { to: "/home/market/boards"; search: { type: "industry" | "concept" } } | null {
  if (pathname !== "/home/signals/heatmap" && pathname !== "/home/signals/fundflow") {
    return null;
  }
  const category = pathname === "/home/signals/heatmap" ? search.tab : search.category;
  return {
    to: "/home/market/boards",
    search: { type: category === "concept" ? "concept" : "industry" },
  };
}

export function formatRotationValue(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatRankChange(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value}`;
}

export function selectRotationQuadrantRows(
  rows: readonly MarketRotationRow[],
  phases: readonly MarketRotationRow["phase"][],
  limit = 3,
): MarketRotationRow[] {
  return rows.filter((row) => phases.includes(row.phase)).slice(0, limit);
}

export function formatExcessReturn(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}pct`;
}

export function marketBreadthNarrative(input: {
  industry: { total: number; rising: number; falling: number };
  growthRelative20d: number | null;
  growthState: GrowthDefenseRotation["current"]["state"];
}): string {
  const breadth =
    input.industry.total <= 0
      ? "行业广度数据不足"
      : input.industry.rising > input.industry.falling
        ? "行业广度偏强"
        : input.industry.rising < input.industry.falling
          ? "行业广度偏弱"
          : "行业广度均衡";
  const style =
    input.growthRelative20d != null && input.growthRelative20d > 0
      ? "成长风格继续领先"
      : input.growthRelative20d != null && input.growthRelative20d < 0
        ? "防守风格继续领先"
        : input.growthState === "低区"
          ? "成长风格占优"
          : input.growthState === "高区"
            ? "防守风格占优"
            : "风格轮动中性";
  return `${breadth}，${style}`;
}

export function buildLimitUpConcentration(
  leaders: Array<{ industry: string | null; count: number }>,
  total: number,
): Array<{ industry: string; count: number; percent: number }> {
  if (total <= 0) return [];
  const counts = new Map<string, number>();
  for (const leader of leaders) {
    if (!leader.industry || !Number.isFinite(leader.count) || leader.count <= 0) continue;
    counts.set(leader.industry, (counts.get(leader.industry) ?? 0) + leader.count);
  }
  return [...counts.entries()]
    .map(([industry, count]) => ({
      industry,
      count,
      percent: Math.round((count / total) * 1000) / 10,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);
}

export function sealRate(total: number, openedCount: number): number | null {
  const attempts = total + openedCount;
  if (attempts <= 0) return null;
  return Math.round((total / attempts) * 1000) / 10;
}

export function paginateRows<T>(
  rows: readonly T[],
  requestedPage: number,
  pageSize = MARKET_PAGE_SIZE,
): {
  rows: T[];
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
} {
  const normalizedSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(rows.length / normalizedSize));
  const page = Math.min(Math.max(Math.floor(requestedPage) || 1, 1), totalPages);
  const start = (page - 1) * normalizedSize;
  const selected = rows.slice(start, start + normalizedSize);
  return {
    rows: selected,
    page,
    totalPages,
    rangeStart: rows.length === 0 ? 0 : start + 1,
    rangeEnd: rows.length === 0 ? 0 : start + selected.length,
  };
}

export type PaginationToken = number | "ellipsis-left" | "ellipsis-right";

export function paginationTokens(
  requestedPage: number,
  totalPages: number,
): PaginationToken[] {
  const pages = Math.max(1, Math.floor(totalPages));
  const current = Math.min(Math.max(Math.floor(requestedPage) || 1, 1), pages);
  const visible = new Set<number>([1, pages, current - 1, current, current + 1]);
  const numbers = [...visible]
    .filter((page) => page >= 1 && page <= pages)
    .sort((left, right) => left - right);
  const tokens: PaginationToken[] = [];
  for (const page of numbers) {
    const previous = tokens.at(-1);
    if (typeof previous === "number" && page - previous > 1) {
      tokens.push(page === pages ? "ellipsis-right" : "ellipsis-left");
    }
    tokens.push(page);
  }
  return tokens;
}

export interface MarketCapHeatmapRow {
  code: string;
  name: string;
  marketCap: number;
  changePercent: number | null;
}

export const MARKET_CAP_HEATMAP_LIMIT = 20;

export type HeatmapColorLevel =
  | -4
  | -3
  | -2
  | -1
  | 0
  | 1
  | 2
  | 3
  | 4
  | "missing";

export function heatmapColorLevel(changePercent: number | null): HeatmapColorLevel {
  if (changePercent == null || !Number.isFinite(changePercent)) return "missing";
  if (changePercent === 0) return 0;
  if (changePercent >= 3) return 4;
  if (changePercent >= 2) return 3;
  if (changePercent >= 1) return 2;
  if (changePercent > 0) return 1;
  if (changePercent <= -3) return -4;
  if (changePercent <= -2) return -3;
  if (changePercent <= -1) return -2;
  return -1;
}

export function selectMarketCapHeatmapRows<T extends MarketCapHeatmapRow>(
  rows: readonly T[],
  limit = MARKET_CAP_HEATMAP_LIMIT,
): T[] {
  const seen = new Set<string>();
  return [...rows]
    .filter((row) => Number.isFinite(row.marketCap) && row.marketCap > 0)
    .sort((left, right) => right.marketCap - left.marketCap)
    .filter((row) => {
      const key = `${Math.round(row.marketCap)}:${row.changePercent ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function heatmapGridSpan(index: number): {
  columns: number;
  rows: number;
} {
  if (index === 0) return { columns: 2, rows: 2 };
  if (index === 1 || index === 5 || index === 11) {
    return { columns: 1, rows: 2 };
  }
  if (index === 3 || index === 8) return { columns: 2, rows: 1 };
  return { columns: 1, rows: 1 };
}

const MAIN_INDEX_ORDER = [
  "000001.SH",
  "000300.SH",
  "000905.SH",
  "000852.SH",
  "399673.SZ",
  "000688.SH",
  "930955.CSI",
] as const;

export function splitMainIndices(items: MainIndexItem[]): {
  benchmark: MainIndexItem | null;
  styles: MainIndexItem[];
} {
  const order = new Map<string, number>(
    MAIN_INDEX_ORDER.map((code, index) => [code, index]),
  );
  return {
    benchmark: items.find((item) => item.isBenchmark || item.code === "000001.SH") ?? null,
    styles: items
      .filter((item) => !item.isBenchmark && item.code !== "000001.SH")
      .sort(
        (left, right) =>
          (order.get(left.code) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.code) ?? Number.MAX_SAFE_INTEGER),
      ),
  };
}

export function mainIndexSampleLabel(
  status: MarketSectionStatus,
  validStyleCount: number,
): string {
  if (status === "available") return `${validStyleCount} 项完整`;
  if (status === "low") return `样本不足 · ${validStyleCount} 项可用`;
  if (status === "missing") return "数据不可用";
  return "读取失败";
}

export function marketRotationRequestPath(
  scope: RotationScope,
  window: RotationWindow,
): string {
  return `/api/v1/market-center/rotation?scope=${scope}&window=${window}`;
}

export function formatMoney(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${(value / 100_000_000).toFixed(1)} 亿`;
}

export function rotationQualityLabel(status: MarketSectionStatus): string {
  if (status === "available") return "可用";
  if (status === "low") return "历史不足";
  if (status === "missing") return "暂无数据";
  return "读取失败";
}

export function rotationStateTone(state: string): "up" | "down" | "neutral" {
  if (state === "加速" || state === "扩散" || state === "修复" || state === "低区") return "up";
  if (state === "退潮" || state === "放缓" || state === "高区") return "down";
  return "neutral";
}
