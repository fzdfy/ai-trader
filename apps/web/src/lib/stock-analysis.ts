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
  const normalized = normalizeStockSymbol(symbol) ?? symbol.trim().toUpperCase();
  return `/home/market/stock/${encodeURIComponent(normalized)}?mode=research`;
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

export interface ContentModuleResult {
  ok: boolean;
  inserted: number;
  total: number;
  observedAt: string;
  error: string | null;
}

export interface ContentRefreshResponse {
  symbol: string;
  modules: {
    news: ContentModuleResult;
    announcements: ContentModuleResult;
    reports: ContentModuleResult;
  };
}

export interface ContentRefreshSummary {
  tone: "success" | "warning" | "error";
  label: string;
  detail: string;
  failedModules: string[];
}

export interface ResearchIndexStatus {
  symbol: string;
  windowDays: number;
  total: number;
  pending: number;
  extracted: number;
  failed: number;
  action: "sync_metadata" | "index_reports" | "none";
  observedAt: string;
}

export interface ResearchIndexStatusView {
  label: string;
  tone: "success" | "warning" | "error" | "neutral";
  detail: string;
  isActive: boolean;
}

export function formatResearchIndexStatus(status: ResearchIndexStatus): ResearchIndexStatusView {
  if (status.total === 0) {
    return status.action === "sync_metadata"
      ? {
          label: "等待元数据",
          tone: "warning",
          detail: "正在同步最近 12 个月研报元数据。",
          isActive: true,
        }
      : {
          label: "暂无全文",
          tone: "neutral",
          detail: "当前没有可引用全文，研报元数据同步后会自动触发索引。",
          isActive: false,
        };
  }

  if (status.pending > 0) {
    const label =
      status.extracted > 0
        ? `索引中 ${status.extracted}/${status.total}`
        : `${status.pending} 篇待索引`;
    return {
      label,
      tone: "warning",
      detail: [
        status.extracted > 0
          ? `已完成 ${status.extracted} 篇，剩余 ${status.pending} 篇正在排队或提取。`
          : "全文索引任务已进入队列，完成后可按主题检索页码和原文片段。",
        status.failed > 0 ? `${status.failed} 篇失败。` : "",
      ].join(""),
      isActive: true,
    };
  }

  if (status.failed > 0 && status.extracted > 0) {
    return {
      label: `已索引 ${status.extracted} 篇 · ${status.failed} 失败`,
      tone: "warning",
      detail: `${status.failed} 篇研报全文提取失败，已索引内容仍可检索；可单独重试失败研报。`,
      isActive: false,
    };
  }

  if (status.failed > 0) {
    return {
      label: `${status.failed} 篇提取失败`,
      tone: "error",
      detail: "全文提取全部失败；可单独重试失败研报。",
      isActive: false,
    };
  }

  return {
    label: `已索引 ${status.extracted} 篇`,
    tone: "success",
    detail: `最近 ${status.windowDays} 天研报全文已可检索。`,
    isActive: false,
  };
}

export function shouldPollResearchIndex(status: ResearchIndexStatus | null | undefined): boolean {
  return status?.action !== "none";
}

const CONTENT_MODULES = [
  { key: "news", label: "新闻", unit: "条" },
  { key: "announcements", label: "公告", unit: "条" },
  { key: "reports", label: "研报", unit: "篇" },
] as const;

export function formatContentRefreshSummary(
  data: ContentRefreshResponse | null | undefined,
): ContentRefreshSummary {
  const modules = data?.modules;
  if (!modules) {
    return {
      tone: "warning",
      label: "刷新结果不完整",
      detail: "未收到完整模块状态，请重新分析。",
      failedModules: CONTENT_MODULES.map((item) => item.label),
    };
  }
  const failures = CONTENT_MODULES.filter((item) => !modules[item.key]?.ok);
  if (failures.length === CONTENT_MODULES.length) {
    return {
      tone: "error",
      label: "内容更新失败",
      detail: failures
        .map((item) => `${item.label}：${modules[item.key]?.error ?? "未完成"}`)
        .join("；"),
      failedModules: failures.map((item) => item.label),
    };
  }
  if (failures.length > 0) {
    return {
      tone: "warning",
      label: "部分内容更新失败",
      detail: failures
        .map((item) => `${item.label}：${modules[item.key]?.error ?? "未完成"}`)
        .join("；"),
      failedModules: failures.map((item) => item.label),
    };
  }
  return {
    tone: "success",
    label: "新闻、公告和研报已更新",
    detail: CONTENT_MODULES.map(
      (item) => `${item.label} ${modules[item.key]?.total ?? 0} ${item.unit}`,
    ).join(" · "),
    failedModules: [],
  };
}

export type StockContentEventType = "news" | "announcement" | "report";

export interface StockContentTimelineItem {
  id: string;
  type: StockContentEventType;
  title: string;
  source: string;
  publishedAt: string | null;
  href: string | null;
  meta: string;
}

export interface StockContentTimelineInput {
  news: Array<{
    id: number;
    source: string;
    title: string;
    url: string;
    publishedAt: string | null;
  }>;
  announcements: Array<{
    id: number;
    source?: string;
    title: string;
    announcementType: string | null;
    publishAt: string;
    sourceUrl: string | null;
  }>;
  reports: Array<{
    id: number;
    title: string;
    institution: string | null;
    rating: string | null;
    publishDate: string;
    pdfUrl: string | null;
    extractStatus: string | null;
    storageKey: string | null;
  }>;
}

function contentSourceLabel(source: string): string {
  if (source === "eastmoney" || source === "eastmoney_stock" || source === "eastmoney_global") {
    return "东方财富";
  }
  if (source === "sina") return "新浪";
  if (source === "cls") return "财联社";
  if (source === "cninfo") return "巨潮资讯";
  return source;
}

export function buildStockContentTimeline(
  input: StockContentTimelineInput,
): StockContentTimelineItem[] {
  return [
    ...input.news.map((item) => ({
      id: `news-${item.id}`,
      type: "news" as const,
      title: item.title,
      source: contentSourceLabel(item.source),
      publishedAt: item.publishedAt,
      href: item.url.startsWith("fallback:") ? null : item.url,
      meta: "个股新闻",
    })),
    ...input.announcements.map((item) => ({
      id: `announcement-${item.id}`,
      type: "announcement" as const,
      title: item.title,
      source: contentSourceLabel(item.source ?? "cninfo"),
      publishedAt: item.publishAt,
      href: item.sourceUrl,
      meta: item.announcementType ?? "公司公告",
    })),
    ...input.reports.map((item) => ({
      id: `report-${item.id}`,
      type: "report" as const,
      title: item.title,
      source: item.institution ?? "机构未知",
      publishedAt: item.publishDate,
      href: item.storageKey ? `/api/v1/research-reports/${item.id}/pdf` : item.pdfUrl,
      meta: [item.rating, item.extractStatus === "extracted" ? "PDF 已提取" : "PDF 待提取"]
        .filter(Boolean)
        .join(" · "),
    })),
  ].sort(
    (left, right) =>
      (Date.parse(right.publishedAt ?? "") || 0) - (Date.parse(left.publishedAt ?? "") || 0),
  );
}

export function selectStockContentPreview(
  items: readonly StockContentTimelineItem[],
  limit = 8,
): StockContentTimelineItem[] {
  if (limit <= 0) return [];
  const caps: Record<StockContentEventType, number> = {
    news: 4,
    announcement: 2,
    report: 2,
  };
  const counts: Record<StockContentEventType, number> = {
    news: 0,
    announcement: 0,
    report: 0,
  };
  const selected: StockContentTimelineItem[] = [];
  for (const item of items) {
    if (counts[item.type] >= caps[item.type]) continue;
    selected.push(item);
    counts[item.type]++;
    if (selected.length >= limit) return selected;
  }
  for (const item of items) {
    if (selected.some((candidate) => candidate.id === item.id)) continue;
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected.sort(
    (left, right) =>
      (Date.parse(right.publishedAt ?? "") || 0) - (Date.parse(left.publishedAt ?? "") || 0),
  );
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
