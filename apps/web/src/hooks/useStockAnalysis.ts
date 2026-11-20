import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  normalizeCompareSymbols,
  shouldPollResearchIndex,
  type ContentRefreshResponse,
  type ResearchIndexStatus,
} from "../lib/stock-analysis";

export type AnalysisQuality = "available" | "low" | "missing";

export interface TechnicalSnapshot {
  asOf: string;
  close: number;
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  rsi14: number;
  atr14: number;
  volatility20: number;
  support20: number;
  resistance60: number;
  change20: number;
  change60: number;
  maxDrawdown60: number;
}

export interface ScenarioForecast {
  horizon: "5D" | "20D" | "60D";
  asOf: string | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  upProbability: number | null;
  sampleCount: number;
  backtestHitRate: number | null;
  backtestSampleCount: number;
  modelVersion: string;
  quality: AnalysisQuality;
}

export interface RiskReferenceRange {
  low: number | null;
  high: number | null;
  technical: { low: number; high: number } | null;
  valuation: { low: number; high: number } | null;
  scenario: { low: number; high: number } | null;
  quality: AnalysisQuality;
}

export interface StockAnalysisModule<T> {
  data: T;
  asOf: string | null;
  source: string;
  quality: AnalysisQuality;
}

export interface StockAnalysisResponse {
  symbol: string;
  name: string;
  exchange: string;
  status: string;
  quote: StockAnalysisModule<{
    last: number | null;
    change: number | null;
    changePct: number | null;
    pe: number | null;
    pb: number | null;
    turnoverRate: number | null;
    totalMarketCap: number | null;
    status: string | null;
    at: string | null;
  } | null>;
  prices: StockAnalysisModule<
    Array<{
      time: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      amount: number | null;
    }>
  >;
  technical: StockAnalysisModule<TechnicalSnapshot | null>;
  forecasts: StockAnalysisModule<ScenarioForecast[]>;
  riskReferenceRange: StockAnalysisModule<RiskReferenceRange>;
  reports: StockAnalysisModule<
    Array<{
      id: number;
      source: string;
      title: string;
      institution: string | null;
      rating: string | null;
      publishDate: string;
      pdfUrl: string | null;
      extractStatus: string | null;
      storageKey: string | null;
      pageCount: number | null;
    }>
  >;
  reportCount: number;
  reportPdfPending: number;
  reportIndex: ResearchIndexStatus;
  fundamentals: StockAnalysisModule<{
    reportPeriod: string;
    metrics: Record<string, number | string | null>;
  } | null>;
  consensus: StockAnalysisModule<{
    fiscalYear: number;
    epsMin: number | null;
    epsMean: number | null;
    epsMax: number | null;
    analystCount: number | null;
  } | null>;
  valuation: StockAnalysisModule<{
    tradeDate: string;
    peTtm: number | null;
    pb: number | null;
  } | null>;
  funds: StockAnalysisModule<
    Array<{
      date: string;
      close: number | null;
      changePct: number | null;
      mainNetInflow: number;
      superLargeNetInflow: number;
      largeNetInflow: number;
      mediumNetInflow: number;
      smallNetInflow: number;
    }>
  >;
  fundSummary: {
    latest: number | null;
    fiveDay: number | null;
    twentyDay: number | null;
    asOf: string | null;
  };
  news: StockAnalysisModule<
    Array<{
      id: number;
      source: string;
      title: string;
      url: string;
      publishedAt: string | null;
    }>
  >;
  announcements: StockAnalysisModule<
    Array<{
      id: number;
      source: string;
      title: string;
      announcementType: string | null;
      publishAt: string;
      sourceUrl: string | null;
    }>
  >;
  summary: {
    title: string;
    body: string;
    tags: string[];
    quality: AnalysisQuality;
  };
}

export interface StockComparisonResponse {
  symbols: string[];
  asOf: string | null;
  items: Array<{
    symbol: string;
    name: string;
    exchange: string;
    quote: {
      last: number | null;
      changePct: number | null;
      pe: number | null;
      pb: number | null;
      totalMarketCap: number | null;
      at: string | null;
      quality: AnalysisQuality;
    };
    reportCount: number;
    technical: TechnicalSnapshot | null;
    forecasts: ScenarioForecast[];
    forecastQuality: AnalysisQuality;
  }>;
}

export interface LatestQuote {
  symbol: string;
  name: string | null;
  last: string | null;
  changePct: string | null;
  pe: string | null;
  pb: string | null;
  ts: string;
}

export interface ResearchEvidence {
  reportId: number;
  sourceId: string;
  title: string;
  institution: string | null;
  publishDate: string;
  pdfUrl: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  sectionTitle: string | null;
  excerpt: string | null;
  similarity: number | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = (await response.json()) as { success?: boolean; data?: T; error?: string };
  if (!response.ok || !payload.success || payload.data == null) {
    throw new Error(payload.error ?? "个股分析数据读取失败");
  }
  return payload.data;
}

export function useStockAnalysisQuery(symbol: string) {
  return useQuery({
    queryKey: ["stock-analysis", symbol],
    queryFn: () =>
      fetchJson<StockAnalysisResponse>(`/api/v1/stock-analysis/${encodeURIComponent(symbol)}`),
    staleTime: 60_000,
    refetchInterval: (query) =>
      shouldPollResearchIndex(query.state.data?.reportIndex) ? 3_000 : false,
    enabled: Boolean(symbol),
  });
}

export function useStockComparisonQuery(symbols: readonly string[]) {
  const normalized = normalizeCompareSymbols(symbols);
  return useQuery({
    queryKey: ["stock-analysis", "compare", normalized],
    queryFn: () =>
      fetchJson<StockComparisonResponse>(
        `/api/v1/stock-analysis/compare?symbols=${encodeURIComponent(normalized.join(","))}`,
      ),
    staleTime: 60_000,
    enabled: normalized.length >= 1,
  });
}

export function useLatestQuotesQuery(symbols: readonly string[]) {
  const normalized = [...new Set(symbols.filter(Boolean))];
  return useQuery({
    queryKey: ["quotes", "latest", normalized],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/quotes/latest?codes=${encodeURIComponent(normalized.join(","))}`,
      );
      const payload = (await response.json()) as { success?: boolean; data?: LatestQuote[] };
      if (!response.ok || !payload.success) throw new Error("行情读取失败");
      return new Map((payload.data ?? []).map((quote) => [quote.symbol, quote]));
    },
    staleTime: 30_000,
    enabled: normalized.length > 0,
  });
}

export function useRefreshStockAnalysis(symbol: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/stock-analysis/${encodeURIComponent(symbol)}/refresh`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: ContentRefreshResponse;
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "内容同步失败");
      }
      return payload.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stock-analysis", symbol] });
      void queryClient.invalidateQueries({ queryKey: ["stock-analysis", "compare"] });
    },
  });
}

export function useStartResearchIndexWindow(symbol: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v1/research-reports/index-window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, days: 30 }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: { queued: number; skipped: number; failed: number };
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "研报索引任务提交失败");
      }
      return payload.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["stock-analysis", symbol],
      });
    },
  });
}

export function useResearchEvidenceQuery(symbol: string, query: string) {
  return useQuery({
    queryKey: ["research-reports", "search", symbol, query],
    queryFn: async () => {
      const response = await fetch("/api/v1/research-reports/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, query, limit: 8 }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: { mode: "semantic" | "keyword"; items: ResearchEvidence[] };
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "研报检索失败");
      }
      return payload.data;
    },
    enabled: Boolean(symbol && query.trim()),
    staleTime: 60_000,
  });
}

export function useIngestResearchReport(symbol: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: number) => {
      const response = await fetch(`/api/v1/research-reports/${reportId}/ingest`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: {
          reportId: number;
          status: "queued" | "already_indexed";
          jobId: string | null;
        };
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "研报入库失败");
      }
      return payload.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stock-analysis", symbol] });
      void queryClient.invalidateQueries({
        queryKey: ["research-reports", "search", symbol],
      });
    },
  });
}
