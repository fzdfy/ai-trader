import type { QuoteRead } from "../market-data-read";
import { marketDataReader } from "../market-data-read";
import {
  MAIN_INDEX_DEFINITIONS,
  type MainIndexDefinition,
} from "../market-rotation/benchmark";
import {
  readRotationIndexBars,
  type StoredRotationIndexBar,
} from "../market-rotation/store";
import { MAIN_INDEX_SYMBOLS } from "../../db/schema/market-rotation";

export type MainIndexQuality = "available" | "low" | "missing";
export type MainIndexSource = "tencent" | "quote_latest" | "csindex" | "none";

export interface MainIndexQuoteItem {
  code: string;
  name: string;
  role: MainIndexDefinition["role"];
  isBenchmark: boolean;
  price: number | null;
  changePct: number | null;
  priceUnit: string;
  asOf: string | null;
  source: MainIndexSource;
  quality: MainIndexQuality;
  staleReason: string | null;
  trend: Array<{ date: string; value: number }>;
}

export interface MainIndexQuoteSection {
  status: "available" | "low" | "missing";
  asOf: string | null;
  items: MainIndexQuoteItem[];
  errors: Array<{ section: string; message: string }>;
}

export interface MainIndexQuoteDependencies {
  now: () => Date;
  readQuote: (symbol: string) => Promise<QuoteRead>;
  readBars: () => Promise<StoredRotationIndexBar[]>;
}

function dateDaysAgo(now: Date, days: number): string {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

const defaultDependencies: MainIndexQuoteDependencies = {
  now: () => new Date(),
  readQuote: (symbol) => marketDataReader.readQuote(symbol),
  readBars: () => {
    const now = new Date();
    return readRotationIndexBars(
      MAIN_INDEX_SYMBOLS,
      dateDaysAgo(now, 120),
      dateDaysAgo(now, -1),
      5000,
    );
  },
};

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function sourceForLive(read: QuoteRead): MainIndexSource {
  if (read.source === "quant-live") return "tencent";
  if (read.source === "quote_latest") return "quote_latest";
  return "none";
}

function trendFor(
  definition: MainIndexDefinition,
  bars: StoredRotationIndexBar[],
): MainIndexQuoteItem["trend"] {
  return bars
    .filter((bar) => bar.symbol === definition.code)
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate))
    .slice(-28)
    .map((bar) => ({ date: bar.tradeDate, value: bar.close }));
}

function missingItem(
  definition: MainIndexDefinition,
  trend: MainIndexQuoteItem["trend"],
  message: string,
): MainIndexQuoteItem {
  return {
    code: definition.code,
    name: definition.name,
    role: definition.role,
    isBenchmark: definition.isBenchmark,
    price: null,
    changePct: null,
    priceUnit: "点",
    asOf: null,
    source: "none",
    quality: "missing",
    staleReason: message,
    trend,
  };
}

function dividendItem(
  definition: MainIndexDefinition,
  bars: StoredRotationIndexBar[],
  trend: MainIndexQuoteItem["trend"],
): { item: MainIndexQuoteItem; error: string | null } {
  const sorted = bars
    .filter((bar) => bar.symbol === definition.code)
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
  const latest = sorted.at(-1);
  const previous = sorted.at(-2);
  if (!latest) {
    return {
      item: missingItem(definition, trend, "暂无中证官方收盘"),
      error: "暂无中证官方收盘",
    };
  }
  const changePct =
    previous && previous.close > 0
      ? roundTwo(((latest.close / previous.close) - 1) * 100)
      : null;
  return {
    item: {
      code: definition.code,
      name: definition.name,
      role: definition.role,
      isBenchmark: definition.isBenchmark,
      price: latest.close,
      changePct,
      priceUnit: "点",
      asOf: latest.tradeDate,
      source: "csindex",
      quality: changePct == null ? "low" : "available",
      staleReason: changePct == null ? "缺少前一交易日官方收盘" : null,
      trend,
    },
    error: changePct == null ? "缺少前一交易日官方收盘" : null,
  };
}

export async function createMainIndexQuoteSection(
  dependencies: MainIndexQuoteDependencies = defaultDependencies,
): Promise<MainIndexQuoteSection> {
  const [barResult, ...quoteResults] = await Promise.allSettled([
    dependencies.readBars(),
    ...MAIN_INDEX_DEFINITIONS
      .filter((item) => item.code !== "930955.CSI")
      .map((item) => dependencies.readQuote(item.code)),
  ]);
  const bars = barResult.status === "fulfilled" ? barResult.value : [];
  const errors: MainIndexQuoteSection["errors"] = [];
  if (barResult.status === "rejected") {
    errors.push({ section: "rotation-index-daily", message: String(barResult.reason) });
  }

  const items = MAIN_INDEX_DEFINITIONS.map((definition, index): MainIndexQuoteItem => {
    const trend = trendFor(definition, bars);
    if (definition.code === "930955.CSI") {
      const result = dividendItem(definition, bars, trend);
      if (result.error) errors.push({ section: definition.code, message: result.error });
      return result.item;
    }

    const result = quoteResults[index];
    if (!result || result.status === "rejected") {
      const message = result?.status === "rejected" ? String(result.reason) : "行情读取失败";
      errors.push({ section: definition.code, message });
      return missingItem(definition, trend, message);
    }
    const read = result.value;
    if (!read.quote?.last) {
      errors.push({ section: definition.code, message: "暂无有效实时或缓存行情" });
      return missingItem(definition, trend, "暂无有效实时或缓存行情");
    }
    const quality: MainIndexQuality =
      read.quality === "available" || read.quality === "low" ? read.quality : "missing";
    if (quality !== "available") {
      errors.push({
        section: definition.code,
        message: quality === "low" ? "行情已过期" : "行情缺失",
      });
    }
    return {
      code: definition.code,
      name: definition.name,
      role: definition.role,
      isBenchmark: definition.isBenchmark,
      price: read.quote.last,
      changePct: read.quote.changePct,
      priceUnit: "点",
      asOf: read.asOf,
      source: sourceForLive(read),
      quality,
      staleReason: quality === "low" ? "行情已过期" : null,
      trend,
    };
  });

  const availableCount = items.filter((item) => item.quality === "available").length;
  const asOf =
    items
      .map((item) => item.asOf?.slice(0, 10))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  return {
    status:
      availableCount === items.length
        ? "available"
        : availableCount > 0
          ? "low"
          : "missing",
    asOf,
    items,
    errors,
  };
}

export function loadMainIndexQuotes(): Promise<MainIndexQuoteSection> {
  return createMainIndexQuoteSection();
}
