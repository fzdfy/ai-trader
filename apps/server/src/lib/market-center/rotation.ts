import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db";
import { board, boardKline, fundFlowRank } from "../../db/schema";
import {
  MARKET_ASSET_SYMBOLS,
  type MarketAssetSymbol,
} from "../market-assets/catalog";
import { marketAssetReader } from "../market-assets/reader";
import { readStoredMarketAssetBars } from "../market-assets/store";
import {
  readRotationIndexBars,
  upsertRotationIndexBars,
  type RotationIndexBarValue,
} from "../market-rotation/store";
import {
  computeGrowthDefense,
  computeRotationRanking,
  type GrowthDefenseResult,
  type RotationRow,
  type RotationWindow,
} from "../market-rotation/compute";
import { quant } from "../quant";
import { loadDashboardSnapshot } from "../dashboard/dashboard-snapshot";
import {
  computeBenchmarkRotation,
  MAIN_BENCHMARK_CODE,
  MAIN_INDEX_DEFINITIONS,
} from "../market-rotation/benchmark";
import { MAIN_INDEX_SYMBOLS } from "../../db/schema/market-rotation";
import { buildBoardRotationSeries } from "./board-rotation";
import { loadMainIndexQuotes } from "./main-indices";
import { buildOverviewSections } from "./overview-summary";
import { buildAssetRotationSeries } from "./rotation-assets";

export type MarketRotationScope =
  | "growth-defense"
  | "industry"
  | "concept"
  | "asset"
  | "main-benchmark";

export interface GrowthDefenseRotation {
  current: GrowthDefenseResult;
  series: Array<{ date: string; value: number }>;
}

export interface MarketRotationResponse {
  scope: MarketRotationScope;
  window: RotationWindow;
  asOf: string | null;
  status: "available" | "low" | "missing" | "error";
  rows: RotationRow[];
  growthDefense: GrowthDefenseRotation | null;
  benchmark: {
    code: string;
    name: string;
    returnPct: number | null;
  } | null;
  validStyleCount: number;
  errors: Array<{ section: string; message: string }>;
}

function dateDaysAgo(now: Date, days: number): string {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export async function loadBoardRotation(
  type: "industry" | "concept",
  window: RotationWindow,
  now = new Date(),
): Promise<MarketRotationResponse> {
  const start = dateDaysAgo(now, 260);
  const [boardRows, klineRows, latestFundRows] = await Promise.all([
    db
      .select({
        code: board.code,
        type: board.type,
        name: board.name,
      })
      .from(board)
      .where(eq(board.type, type)),
    db
      .select({
        code: boardKline.code,
        date: sql<string>`to_char(${boardKline.time}, 'YYYY-MM-DD')`,
        close: boardKline.close,
      })
      .from(boardKline)
      .innerJoin(board, eq(boardKline.code, board.code))
      .where(and(eq(board.type, type), gte(boardKline.time, new Date(start))))
      .orderBy(asc(boardKline.time)),
    db
      .select({
        code: fundFlowRank.code,
        mainNetInflow: fundFlowRank.mainNetInflow,
      })
      .from(fundFlowRank)
      .where(eq(fundFlowRank.category, type))
      .orderBy(desc(fundFlowRank.date), asc(fundFlowRank.rank))
      .limit(200),
  ]);
  const series = buildBoardRotationSeries(type, boardRows, klineRows);
  const funding = new Map<string, number>();
  for (const row of latestFundRows) {
    const value = Number(row.mainNetInflow);
    if (row.mainNetInflow != null && Number.isFinite(value)) funding.set(row.code, value);
  }
  const computed = computeRotationRanking(series, window, funding);
  const asOf = series
    .map((item) => item.points.at(-1)?.date)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  return {
    scope: type,
    window,
    asOf,
    status: computed.some((row) => row.quality === "available")
      ? "available"
      : computed.some((row) => row.quality === "low")
        ? "low"
        : "missing",
    rows: computed,
    growthDefense: null,
    benchmark: null,
    validStyleCount: 0,
    errors: [],
  };
}

const ROTATION_ASSETS: MarketAssetSymbol[] = [
  "510300.SH",
  "588000.SH",
  "XAUUSD",
  "IXIC",
];

export async function loadAssetRotation(
  window: RotationWindow,
): Promise<MarketRotationResponse> {
  const batches = await Promise.allSettled(
    ROTATION_ASSETS.map((symbol) =>
      readStoredMarketAssetBars(symbol, "daily", { limit: 180 }),
    ),
  );
  const errors: MarketRotationResponse["errors"] = [];
  const inputs: Array<{
    symbol: MarketAssetSymbol;
    bars: Array<{ sessionDate: string; close: number }>;
  }> = [];
  for (let index = 0; index < ROTATION_ASSETS.length; index += 1) {
    const symbol = ROTATION_ASSETS[index]!;
    const result = batches[index]!;
    if (result.status === "rejected") {
      errors.push({ section: symbol, message: String(result.reason) });
      continue;
    }
    inputs.push({ symbol, bars: result.value });
  }
  const collected = buildAssetRotationSeries(inputs);
  const series = collected.series;
  errors.push(...collected.errors);
  const rows = computeRotationRanking(series, window);
  return {
    scope: "asset",
    window,
    asOf: series.map((item) => item.points.at(-1)?.date).filter(Boolean).sort().at(-1) ?? null,
    status: rows.some((row) => row.quality === "available") ? "available" : rows.length ? "low" : "missing",
    rows,
    growthDefense: null,
    benchmark: null,
    validStyleCount: 0,
    errors,
  };
}

async function ensureGrowthDefenseBars(now: Date): Promise<void> {
  const existing = await readRotationIndexBars(
    ["399673.SZ", "930955.CSI"],
    dateDaysAgo(now, 730),
    dateDaysAgo(now, -1),
    3000,
  );
  if (existing.some((row) => row.symbol === "399673.SZ") &&
      existing.some((row) => row.symbol === "930955.CSI")) {
    return;
  }
  const payload = await quant.rotationIndexDaily(dateDaysAgo(now, 730), dateDaysAgo(now, -1));
  const values: RotationIndexBarValue[] = payload.bars.map((bar) => ({
    symbol: bar.symbol,
    tradeDate: bar.trade_date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    amount: bar.amount,
    source: bar.source,
  }));
  await upsertRotationIndexBars(values);
}

export async function loadGrowthDefenseRotation(
  window: RotationWindow,
  now = new Date(),
): Promise<MarketRotationResponse> {
  try {
    await ensureGrowthDefenseBars(now);
    const bars = await readRotationIndexBars(
      ["399673.SZ", "930955.CSI"],
      dateDaysAgo(now, 730),
      dateDaysAgo(now, -1),
      3000,
    );
    const growth = bars.filter((bar) => bar.symbol === "399673.SZ");
    const defense = bars.filter((bar) => bar.symbol === "930955.CSI");
    if (growth.length === 0 || defense.length === 0) {
      return {
        scope: "growth-defense",
        window,
        asOf: null,
        status: "missing",
        rows: [],
        growthDefense: null,
        benchmark: null,
        validStyleCount: 0,
        errors: [{ section: "growth-defense", message: "指数日线不足" }],
      };
    }
    const result = computeGrowthDefense(
      {
        code: "399673.SZ",
        name: "创业板50",
        points: growth.map((bar) => ({ date: bar.tradeDate, value: bar.close })),
      },
      {
        code: "930955.CSI",
        name: "红利低波100",
        points: defense.map((bar) => ({ date: bar.tradeDate, value: bar.close })),
      },
    );
    const growthByDate = new Map(growth.map((bar) => [bar.tradeDate, bar.close]));
    return {
      scope: "growth-defense",
      window,
      asOf: result.asOf,
      status: result.quality,
      rows: [],
      growthDefense: {
        current: result,
        series: defense.map((bar) => ({
          date: bar.tradeDate,
          value: (growthByDate.get(bar.tradeDate) ?? 0) / bar.close,
        })).filter((point) => Number.isFinite(point.value) && point.value > 0),
      },
      benchmark: null,
      validStyleCount: 0,
      errors: [],
    };
  } catch (error) {
    return {
      scope: "growth-defense",
      window,
      asOf: null,
      status: "error",
      rows: [],
      growthDefense: null,
      benchmark: null,
      validStyleCount: 0,
      errors: [{ section: "growth-defense", message: String(error) }],
    };
  }
}

async function ensureMainIndexBars(now: Date): Promise<void> {
  const existing = await readRotationIndexBars(
    MAIN_INDEX_SYMBOLS,
    dateDaysAgo(now, 730),
    dateDaysAgo(now, -1),
    5000,
  );
  const present = new Set(existing.map((row) => row.symbol));
  if (MAIN_INDEX_SYMBOLS.every((symbol) => present.has(symbol))) return;

  const payload = await quant.mainIndexDaily(
    dateDaysAgo(now, 730),
    dateDaysAgo(now, -1),
  );
  const values: RotationIndexBarValue[] = payload.bars.map((bar) => ({
    symbol: bar.symbol,
    tradeDate: bar.trade_date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    amount: bar.amount,
    source: bar.source,
  }));
  await upsertRotationIndexBars(values);
}

export async function loadMainBenchmarkRotation(
  window: RotationWindow,
  now = new Date(),
): Promise<MarketRotationResponse> {
  try {
    await ensureMainIndexBars(now);
    const bars = await readRotationIndexBars(
      MAIN_INDEX_SYMBOLS,
      dateDaysAgo(now, 730),
      dateDaysAgo(now, -1),
      5000,
    );
    const series = MAIN_INDEX_DEFINITIONS.map((definition) => ({
      code: definition.code,
      name: definition.name,
      points: bars
        .filter((bar) => bar.symbol === definition.code)
        .map((bar) => ({ date: bar.tradeDate, value: bar.close })),
    })).filter((item) => item.points.length > 0);
    const computed = computeBenchmarkRotation(series, window);
    const errors = MAIN_INDEX_DEFINITIONS.flatMap((definition) =>
      series.some((item) => item.code === definition.code)
        ? []
        : [{ section: definition.code, message: "指数日线缺失" }],
    );
    const benchmark = MAIN_INDEX_DEFINITIONS.find(
      (definition) => definition.code === MAIN_BENCHMARK_CODE,
    );
    return {
      scope: "main-benchmark",
      window,
      asOf: computed.asOf,
      status: computed.status,
      rows: computed.rows.map((row) => ({
        code: row.code,
        name: row.name,
        relativeReturn: row.excessReturn,
        rank: row.rank,
        rankChange: null,
        moneyConfirmation: null,
        limitUpConcentration: null,
        phase: row.rank == null ? "数据不足" : "稳定",
        quality: row.quality,
      })),
      growthDefense: null,
      benchmark: benchmark
        ? {
            code: benchmark.code,
            name: benchmark.name,
            returnPct: computed.benchmarkReturn,
          }
        : null,
      validStyleCount: computed.validStyleCount,
      errors,
    };
  } catch (error) {
    return {
      scope: "main-benchmark",
      window,
      asOf: null,
      status: "error",
      rows: [],
      growthDefense: null,
      benchmark: null,
      validStyleCount: 0,
      errors: [{ section: "main-benchmark", message: String(error) }],
    };
  }
}

export async function loadMarketRotation(
  scope: MarketRotationScope,
  window: RotationWindow,
): Promise<MarketRotationResponse> {
  if (scope === "growth-defense") return loadGrowthDefenseRotation(window);
  if (scope === "asset") return loadAssetRotation(window);
  if (scope === "main-benchmark") return loadMainBenchmarkRotation(window);
  return loadBoardRotation(scope, window);
}

export async function loadMarketCenterOverview(now = new Date()) {
  const [quoteResults, dashboardResult, growthDefense, mainIndices] = await Promise.all([
    Promise.allSettled(
      MARKET_ASSET_SYMBOLS.map((symbol) => marketAssetReader.readQuote(symbol)),
    ),
    loadDashboardSnapshot()
      .then((data) => ({ data, error: null as unknown }))
      .catch((error: unknown) => ({ data: null, error })),
    loadGrowthDefenseRotation("20D", now),
    loadMainIndexQuotes(),
  ]);
  const quotes = quoteResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const errors: Array<{ section: string; message: string }> = quoteResults.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ section: MARKET_ASSET_SYMBOLS[index]!, message: String(result.reason) }]
      : [],
  );
  if (dashboardResult.error) {
    errors.push({ section: "dashboard", message: String(dashboardResult.error) });
  }
  errors.push(...growthDefense.errors);
  errors.push(...mainIndices.errors);
  const sections = dashboardResult.data
    ? buildOverviewSections(dashboardResult.data)
    : {
        breadth: {
          status: "missing" as const,
          industry: { total: 0, rising: 0, falling: 0, flat: 0 },
          concept: { total: 0, rising: 0, falling: 0, flat: 0 },
          asOf: null,
        },
        limitUp: {
          status: "missing" as const,
          total: 0,
          maxBoard: 0,
          maxSealAmount: 0,
          avgTurnover: 0,
          openedCount: 0,
          ladder: [],
          leaders: [],
          asOf: null,
        },
        anomalies: {
          status: "missing" as const,
          items: [],
          asOf: null,
        },
      };
  return {
    generatedAt: now.toISOString(),
    asOf: {
      quotes: quotes
        .map((quote) => quote.asOf)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
      boards: sections.breadth.asOf,
      fundFlow: sections.anomalies.asOf,
      limitUp: sections.limitUp.asOf,
      growthDefense: growthDefense.asOf,
      mainIndices: mainIndices.asOf,
    },
    quotes,
    growthDefense,
    mainIndices,
    ...sections,
    errors,
  };
}
