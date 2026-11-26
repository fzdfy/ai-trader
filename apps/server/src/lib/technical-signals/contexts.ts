import {
  loadAssetRotation,
  loadBoardRotation,
  loadGrowthDefenseRotation,
  loadMainBenchmarkRotation,
  loadMarketCenterOverview,
} from "../market-center/rotation";
import { readStoredMarketAssetBars } from "../market-assets/store";
import type { TechnicalObjectRead } from "./adapters";
import type {
  MarketAdvancedContext,
  SectorAdvancedContext,
  StockAdvancedContext,
} from "./advanced";

const mean = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const CONTEXT_CACHE_MS = 5 * 60_000;
const sectorRotationCache = new Map<
  string,
  {
    expiresAt: number;
    shortRotation: Awaited<ReturnType<typeof loadBoardRotation>>;
    longRotation: Awaited<ReturnType<typeof loadBoardRotation>>;
  }
>();
let benchmarkBarsCache: {
  expiresAt: number;
  bars: Awaited<ReturnType<typeof readStoredMarketAssetBars>>;
} | null = null;

const cachedSectorRotations = async (
  subtype: "industry" | "concept",
  dependencies: {
    rotation20?: typeof loadBoardRotation;
    rotation60?: typeof loadBoardRotation;
  },
) => {
  const cached = sectorRotationCache.get(subtype);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const [shortRotation, longRotation] = await Promise.all([
    (dependencies.rotation20 ?? loadBoardRotation)(subtype, "20D"),
    (dependencies.rotation60 ?? loadBoardRotation)(subtype, "60D"),
  ]);
  const entry = {
    expiresAt: Date.now() + CONTEXT_CACHE_MS,
    shortRotation,
    longRotation,
  };
  sectorRotationCache.set(subtype, entry);
  return entry;
};

const cachedBenchmarkBars = async () => {
  if (benchmarkBarsCache && benchmarkBarsCache.expiresAt > Date.now()) {
    return benchmarkBarsCache.bars;
  }
  const bars = await readStoredMarketAssetBars("000001.SH", "daily", {
    limit: 260,
  });
  benchmarkBarsCache = { expiresAt: Date.now() + CONTEXT_CACHE_MS, bars };
  return bars;
};

const realizedVolatility = (closes: number[], start: number, window = 20): number => {
  const end = start + window;
  if (start < 1 || end > closes.length) return 0;
  const returns = closes
    .slice(start, end)
    .map((close, index) => close / closes[start + index - 1]! - 1);
  const average = mean(returns);
  return Math.sqrt(mean(returns.map((value) => (value - average) ** 2)) * 252);
};

const returnForCode = (
  rows: Array<{ code: string; relativeReturn: number | null }>,
  code: string,
) => (rows.find((row) => row.code === code)?.relativeReturn ?? 0) / 100;

export async function loadMarketAdvancedContext(
  read: TechnicalObjectRead,
  dependencies: {
    overview?: typeof loadMarketCenterOverview;
    growth?: typeof loadGrowthDefenseRotation;
    main?: typeof loadMainBenchmarkRotation;
    asset?: typeof loadAssetRotation;
  } = {},
): Promise<MarketAdvancedContext | null> {
  const [overview, growth, main, asset] = await Promise.all([
    (dependencies.overview ?? loadMarketCenterOverview)(),
    (dependencies.growth ?? loadGrowthDefenseRotation)("20D"),
    (dependencies.main ?? loadMainBenchmarkRotation)("60D"),
    (dependencies.asset ?? loadAssetRotation)("20D"),
  ]);
  const closes = read.bars.map((bar) => bar.close);
  const volumes = read.bars
    .map((bar) => bar.amount)
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (closes.length < 60 || overview.breadth.status === "missing") return null;

  const volatilitySeries = Array.from(
    { length: Math.min(252, Math.max(0, closes.length - 20)) },
    (_, index) => realizedVolatility(closes, index + 1),
  );
  const currentVolatility = realizedVolatility(closes, closes.length - 20);
  const volatilityPercentile =
    volatilitySeries.filter((value) => value <= currentVolatility).length /
    Math.max(volatilitySeries.length, 1);
  const growthReturn = (growth.growthDefense?.current.relativeReturn20d ?? 0) / 100;
  const totalBreadth = Math.max(overview.breadth.industry.total, 1);
  const recentAmount = mean(volumes.slice(-20));
  const previousAmount = mean(volumes.slice(-40, -20));

  return {
    missingDomains: [
      "above_ma200_ratio",
      "breadth_change_5",
      "dollar_return",
      "turnover_change",
      "concentration",
    ],
    styleCoverage:
      main.rows.filter((row) => row.relativeReturn != null).length / 6,
    styleReturns: {
      growth: growthReturn,
      value: -growthReturn,
      small: returnForCode(main.rows, "000852.SH"),
      large: returnForCode(main.rows, "000300.SH"),
      cyclical: returnForCode(main.rows, "000905.SH"),
      defensive: returnForCode(main.rows, "930955.CSI"),
    },
    breadth: {
      advanceDeclineRatio: overview.breadth.industry.rising / totalBreadth,
      aboveMa200Ratio: 0,
      breadthChange5: 0,
    },
    realizedVolatility: currentVolatility,
    volatilityPercentile,
    assetReturns: {
      aShare: returnForCode(asset.rows, "510300.SH"),
      gold: returnForCode(asset.rows, "XAUUSD"),
      overseas: returnForCode(asset.rows, "IXIC"),
      dollar: 0,
    },
    factorStyleReturns: main.rows
      .map((row) => row.relativeReturn)
      .filter((value): value is number => value != null)
      .map((value) => value / 100),
    amountChange20: previousAmount > 0 ? recentAmount / previousAmount - 1 : 0,
    turnoverChange20: 0,
    concentrationTop100: 0.3,
  };
}

const phaseScore = (phase: string): number =>
  phase === "加速" || phase === "扩散" ? 0.65 : phase === "放缓" || phase === "退潮" ? 0.35 : 0.5;

export async function loadSectorAdvancedContext(
  object: { objectSubtype: "industry" | "concept"; objectCode: string },
  read: TechnicalObjectRead,
  dependencies: {
    rotation20?: typeof loadBoardRotation;
    rotation60?: typeof loadBoardRotation;
  } = {},
): Promise<SectorAdvancedContext | null> {
  const [{ shortRotation, longRotation }, benchmarkBars] = await Promise.all([
    cachedSectorRotations(object.objectSubtype, dependencies),
    cachedBenchmarkBars(),
  ]);
  const shortRow = shortRotation.rows.find((row) => row.code === object.objectCode);
  const longRow = longRotation.rows.find((row) => row.code === object.objectCode);
  if (!shortRow) return null;
  const closes = read.bars.map((bar) => bar.close);
  const benchmarkCloses = benchmarkBars.map((bar) => bar.close);
  const sectorReturn20 = closes.length >= 21 ? closes.at(-1)! / closes.at(-21)! - 1 : 0;
  const benchmarkReturn20 =
    benchmarkCloses.length >= 21
      ? benchmarkCloses.at(-1)! / benchmarkCloses.at(-21)! - 1
      : 0;
  const money = shortRow.moneyConfirmation ?? 0;
  const persistenceDays = money > 0 ? 1 : 0;
  return {
    componentBreadthAvailable: false,
    componentPositive: {
      d20: phaseScore(shortRow.phase),
      d60: phaseScore(longRow?.phase ?? shortRow.phase),
      d120: phaseScore(longRow?.phase ?? shortRow.phase),
    },
    sectorReturn20,
    benchmarkReturn20,
    benchmarkAvailable: benchmarkCloses.length >= 21,
    relativeStrengthPercentile60:
      shortRow.rank == null ? 0.5 : 1 - Math.min(shortRow.rank, 100) / 100,
    fundFlow: {
      mainNet: money,
      persistenceDays,
    },
    fundFlowHistoryAvailable: false,
    earningsCoverage: 0,
    earningsGrowth: 0,
    revisionScore: 0,
    valuationPercentile: 0.5,
    leaderResonance: money > 0 && (shortRow.phase === "加速" || shortRow.phase === "扩散"),
    crowdingPercentile: shortRow.rank == null ? 0.5 : 1 - Math.min(shortRow.rank, 100) / 100,
    factorCoverage: {
      momentum: 1,
      quality: 0,
      valuation: 0,
      volatility: 1,
      fundflow: 1,
    },
  };
}

const returnOver = (values: number[], sessions: number): number =>
  values.length > sessions ? values.at(-1)! / values.at(-1 - sessions)! - 1 : 0;

const percentileRank = (values: number[], value: number): number =>
  values.length === 0 ? 0.5 : values.filter((item) => item <= value).length / values.length;

export async function loadStockAdvancedContext(
  object: { objectCode: string },
  read: TechnicalObjectRead,
): Promise<StockAdvancedContext | null> {
  if (read.bars.length < 60) return null;
  const benchmarkBars = await cachedBenchmarkBars();
  const closes = read.bars.map((bar) => bar.close);
  const benchmarkCloses = benchmarkBars.map((bar) => bar.close);
  const returns = {
    d20: returnOver(closes, 20),
    d60: returnOver(closes, 60),
    d120: returnOver(closes, 120),
  };
  const benchmarkReturns = {
    d20: returnOver(benchmarkCloses, 20),
    d60: returnOver(benchmarkCloses, 60),
    d120: returnOver(benchmarkCloses, 120),
  };
  const fundamentalCoverage = 0;
  const returns20 = closes
    .slice(-21)
    .slice(1)
    .map((close, index) => close / closes.at(-21 + index)! - 1);
  const meanReturn = mean(returns20);
  const realizedVol = Math.sqrt(mean(returns20.map((value) => (value - meanReturn) ** 2)) * 252);
  const volatilityHistory = Array.from(
    { length: Math.min(252, Math.max(0, closes.length - 20)) },
    (_, index) => realizedVolatility(closes, index + 1),
  );
  const averageVolume = mean(read.bars.slice(-20).map((bar) => bar.volume ?? 0));
  const obv = read.bars.reduce(
    (values, bar, index) =>
      index === 0
        ? values
        : [
            ...values,
            values.at(-1)! +
              (bar.close > read.bars[index - 1]!.close
                ? (bar.volume ?? 0)
                : bar.close < read.bars[index - 1]!.close
                  ? -(bar.volume ?? 0)
                  : 0),
          ],
    [0],
  );
  const volumeChanges = read.bars
    .slice(-21)
    .slice(1)
    .map((bar) => bar.volume ?? 0);
  const priceChanges = closes
    .slice(-21)
    .slice(1)
    .map((close, index) => close - closes.at(-21 + index)!);
  const averagePriceChange = mean(priceChanges);
  const averageVolumeChange = mean(volumeChanges);
  const priceVolumeCovariance = mean(
    priceChanges.map(
      (value, index) =>
        (value - averagePriceChange) *
        (volumeChanges[index]! - averageVolumeChange),
    ),
  );
  const priceVariance = mean(
    priceChanges.map((value) => (value - averagePriceChange) ** 2),
  );
  const volumeVariance = mean(
    volumeChanges.map((value) => (value - averageVolumeChange) ** 2),
  );
  const priceVolumeCorrelation =
    priceVariance > 0 && volumeVariance > 0
      ? priceVolumeCovariance / Math.sqrt(priceVariance * volumeVariance)
      : 0;
  return {
    returns,
    benchmarkReturns,
    fundamentals: {
      marketCapPercentile: 0.5,
      pbPercentile: 0.5,
      roe: 0,
      grossMargin: 0,
      cashFlowGrowth: 0,
      assetGrowth: 0,
    },
    earningsRevision: null,
    accumulation: {
      obvSlope20:
        obv.length > 21 ? (obv.at(-1)! - obv.at(-21)!) / Math.max(averageVolume * 20, 1) : 0,
      priceVolumeCorrelation,
    },
    volatility: {
      atrPercentile: percentileRank(volatilityHistory, realizedVol),
      bollingerPercentile: percentileRank(volatilityHistory, realizedVol),
    },
    chip: {
      holderChange90: 0,
      costSupportDistance: 0,
    },
    chipAvailable: false,
    industryRelativeStrength20: returns.d20 - benchmarkReturns.d20,
    events: [],
    factorCoverage: {
      momentum: 1,
      quality: fundamentalCoverage,
      valuation: 0,
      revision: 0,
      riskLiquidity: 1,
    },
    fundamentalCoverage,
  };
}
