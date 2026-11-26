import { desc, eq } from "drizzle-orm";

import { db } from "../../db";
import { bar1dHfq, board, boardKline } from "../../db/schema";
import { readStoredMarketAssetBars } from "../market-assets/store";
import type {
  ObjectSubtype,
  SignalResult,
} from "../../../../../packages/signal-catalog/src/contracts.ts";

export interface TechnicalSignalBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  amount: number | null;
}

export interface TechnicalSeriesRead {
  bars: TechnicalSignalBar[];
  asOf: string | null;
  source: string;
  quality: "available" | "low" | "missing";
  hasVolume: boolean;
}

export interface TechnicalObjectRead {
  identity: {
    objectType: SignalResult["objectType"];
    objectSubtype: ObjectSubtype | null;
    objectCode: string;
  };
  bars: TechnicalSignalBar[];
  benchmark: TechnicalSeriesRead | null;
  priceBasis: "shanghai_composite" | "board_index" | "hfq" | "usd_per_ounce";
  volumeApplicable: boolean;
  dataSources: string[];
  quality: "available" | "low" | "missing";
  asOf: string | null;
}

export interface TechnicalObjectAdapterDependencies {
  readMarketIndex(limit: number): Promise<TechnicalSeriesRead>;
  readBenchmark(limit: number): Promise<TechnicalSeriesRead>;
  readBoardKline(code: string, subtype: ObjectSubtype, limit: number): Promise<TechnicalSeriesRead>;
  readStockHfqBars(code: string, limit: number): Promise<TechnicalSeriesRead>;
  readGoldBars(limit: number): Promise<TechnicalSeriesRead>;
}

const combineQuality = (
  first: TechnicalSeriesRead,
  second: TechnicalSeriesRead | null,
): TechnicalSeriesRead["quality"] => {
  if (first.quality === "missing") return "missing";
  if (second?.quality === "missing") return "missing";
  if (first.quality === "low" || second?.quality === "low") return "low";
  return "available";
};

const marketAssetSeries = async (
  symbol: "000001.SH" | "XAUUSD",
  limit: number,
): Promise<TechnicalSeriesRead> => {
  const rows = await readStoredMarketAssetBars(symbol, "daily", { limit });
  const bars = rows.map((row) => ({
    time: row.sessionDate,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: symbol === "XAUUSD" ? null : row.volume,
    amount: symbol === "XAUUSD" ? null : row.amount,
  }));
  return {
    bars,
    asOf: bars.at(-1)?.time ?? null,
    source: "market_asset_daily_bar",
    quality: bars.length >= 252 ? "available" : bars.length > 0 ? "low" : "missing",
    hasVolume: symbol !== "XAUUSD",
  };
};

const defaultDependencies: TechnicalObjectAdapterDependencies = {
  readMarketIndex: (limit) => marketAssetSeries("000001.SH", limit),
  readBenchmark: (limit) => marketAssetSeries("000001.SH", limit),
  async readBoardKline(code, subtype, limit) {
    const [definition] = await db
      .select({ type: board.type })
      .from(board)
      .where(eq(board.code, code))
      .limit(1);
    if (!definition) {
      throw new Error(`unknown board: ${code}`);
    }
    if (definition.type !== subtype) {
      throw new Error(`board ${code} subtype ${subtype} does not match ${definition.type}`);
    }
    const rows = await db
      .select()
      .from(boardKline)
      .where(eq(boardKline.code, code))
      .orderBy(desc(boardKline.time))
      .limit(limit);
    const bars = [...rows].reverse().map((row) => ({
      time: row.time.toISOString().slice(0, 10),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      amount: row.amount == null ? null : Number(row.amount),
    }));
    return {
      bars,
      asOf: bars.at(-1)?.time ?? null,
      source: "board_kline",
      quality: bars.length >= 252 ? "available" : bars.length > 0 ? "low" : "missing",
      hasVolume: true,
    };
  },
  async readStockHfqBars(code, limit) {
    const rows = await db
      .select()
      .from(bar1dHfq)
      .where(eq(bar1dHfq.symbol, code))
      .orderBy(desc(bar1dHfq.time))
      .limit(limit);
    const bars = [...rows].reverse().map((row) => ({
      time: row.time.toISOString(),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      amount: row.amount == null ? null : Number(row.amount),
    }));
    return {
      bars,
      asOf: bars.at(-1)?.time ?? null,
      source: "bar1d_hfq",
      quality: bars.length >= 252 ? "available" : bars.length > 0 ? "low" : "missing",
      hasVolume: true,
    };
  },
  readGoldBars: (limit) => marketAssetSeries("XAUUSD", limit),
};

export function createTechnicalObjectAdapter(
  dependencies: TechnicalObjectAdapterDependencies = defaultDependencies,
) {
  return {
    async read(
      objectType: SignalResult["objectType"],
      objectCode: string,
      objectSubtype: ObjectSubtype | null,
      limit = 320,
    ): Promise<TechnicalObjectRead> {
      if (objectType === "sector") {
        if (objectSubtype !== "industry" && objectSubtype !== "concept") {
          throw new Error("sector technical read requires industry or concept subtype");
        }
        const [source, benchmark] = await Promise.all([
          dependencies.readBoardKline(objectCode, objectSubtype, limit),
          dependencies.readBenchmark(limit),
        ]);
        return {
          identity: { objectType, objectSubtype, objectCode },
          bars: source.bars,
          benchmark,
          priceBasis: "board_index",
          volumeApplicable: source.hasVolume,
          dataSources: [source.source, benchmark.source],
          quality: combineQuality(source, benchmark),
          asOf: source.asOf,
        };
      }
      if (objectSubtype !== null) {
        throw new Error("non-sector technical read requires null subtype");
      }
      if (objectType === "market") {
        const source = await dependencies.readMarketIndex(limit);
        return {
          identity: {
            objectType,
            objectSubtype: null,
            objectCode: "000001.SH",
          },
          bars: source.bars,
          benchmark: null,
          priceBasis: "shanghai_composite",
          volumeApplicable: source.hasVolume,
          dataSources: [source.source],
          quality: source.quality,
          asOf: source.asOf,
        };
      }
      if (objectType === "stock") {
        const source = await dependencies.readStockHfqBars(objectCode, limit);
        return {
          identity: { objectType, objectSubtype: null, objectCode },
          bars: source.bars,
          benchmark: null,
          priceBasis: "hfq",
          volumeApplicable: source.hasVolume,
          dataSources: [source.source],
          quality: source.quality,
          asOf: source.asOf,
        };
      }
      const source = await dependencies.readGoldBars(limit);
      return {
        identity: { objectType, objectSubtype: null, objectCode: "XAUUSD" },
        bars: source.bars,
        benchmark: null,
        priceBasis: "usd_per_ounce",
        volumeApplicable: false,
        dataSources: [source.source],
        quality: source.quality,
        asOf: source.asOf,
      };
    },
  };
}

export const technicalObjectAdapter = createTechnicalObjectAdapter();
