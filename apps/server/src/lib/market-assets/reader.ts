import {
  resolveMarketAsset,
  type MarketAssetDefinition,
  type MarketAssetSymbol,
} from "./catalog";
import {
  readStoredMarketAssetBars,
  readStoredMarketAssetQuote,
  type StoredMarketAssetBar,
  type StoredMarketAssetQuote,
} from "./store";

export interface MarketAssetQuoteRead {
  symbol: MarketAssetSymbol;
  name: string;
  price: number | null;
  preClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  changePct: number | null;
  volume: number | null;
  amount: number | null;
  priceUnit: string;
  asOf: string | null;
  source: string;
  quality: "available" | "low" | "missing";
  staleReason: string | null;
}

export interface MarketAssetBarRead {
  symbol: MarketAssetSymbol;
  name: string;
  points: Array<{
    time: string;
    price: number;
    volume: number | null;
    open: number;
    high: number;
    low: number;
  }>;
  sessionDate: string | null;
  hasVolume: boolean;
  quality: "available" | "low" | "missing";
  staleReason: string | null;
}

export interface MarketAssetReaderDependencies {
  now: () => Date;
  readStoredQuote: (symbol: MarketAssetSymbol) => Promise<StoredMarketAssetQuote | null>;
  readStoredBars: (
    symbol: MarketAssetSymbol,
    options: {
      kind: "minute" | "daily";
      start?: Date;
      end?: Date;
      limit?: number;
      latestSessionOnly?: boolean;
    },
  ) => Promise<StoredMarketAssetBar[]>;
}

function staleThresholdMs(definition: MarketAssetDefinition): number {
  if (definition.session === "global_gold") return 15 * 60_000;
  if (definition.session === "us_equity") return 30 * 60 * 60_000;
  return 4 * 24 * 60 * 60_000;
}

function quoteStaleReason(
  definition: MarketAssetDefinition,
  quotedAt: Date,
  now: Date,
): string | null {
  const age = now.getTime() - quotedAt.getTime();
  if (age <= staleThresholdMs(definition)) return null;
  return `stale quote: ${Math.floor(age / 60_000)} minutes old`;
}

const defaultDependencies: MarketAssetReaderDependencies = {
  now: () => new Date(),
  readStoredQuote: (symbol) => readStoredMarketAssetQuote(symbol),
  readStoredBars: (symbol, options) =>
    readStoredMarketAssetBars(symbol, options.kind, {
      start: options.start,
      end: options.end,
      limit: options.limit,
    }),
};

export function createMarketAssetReader(
  dependencies: MarketAssetReaderDependencies = defaultDependencies,
) {
  const now = dependencies.now;
  return {
    async readQuote(symbol: string): Promise<MarketAssetQuoteRead> {
      const definition = resolveMarketAsset(symbol);
      const stored = await dependencies.readStoredQuote(definition.symbol);
      if (!stored) {
        return {
          symbol: definition.symbol,
          name: definition.name,
          price: null,
          preClose: null,
          open: null,
          high: null,
          low: null,
          changePct: null,
          volume: null,
          amount: null,
          priceUnit: definition.priceUnit,
          asOf: null,
          source: "none",
          quality: "missing",
          staleReason: "no valid snapshot",
        };
      }
      const staleReason = quoteStaleReason(definition, stored.quotedAt, now());
      return {
        symbol: definition.symbol,
        name: definition.name,
        price: stored.price,
        preClose: stored.pre_close,
        open: stored.open,
        high: stored.high,
        low: stored.low,
        changePct: stored.change_pct,
        volume: stored.volume,
        amount: stored.amount,
        priceUnit: definition.priceUnit,
        asOf: stored.quotedAt.toISOString(),
        source: stored.source,
        quality: staleReason ? "low" : "available",
        staleReason,
      };
    },

    async readBars(
      symbol: string,
      options: {
        kind: "minute" | "daily";
        start?: Date;
        end?: Date;
        limit?: number;
        latestSessionOnly?: boolean;
      },
    ): Promise<MarketAssetBarRead> {
      const definition = resolveMarketAsset(symbol);
      const rows = await dependencies.readStoredBars(definition.symbol, options);
      if (rows.length === 0) {
        return {
          symbol: definition.symbol,
          name: definition.name,
          points: [],
          sessionDate: null,
          hasVolume: definition.hasVolume,
          quality: "missing",
          staleReason: "no valid bars",
        };
      }
      const latestSessionDate = rows.at(-1)?.sessionDate;
      const selectedRows = options.latestSessionOnly
        ? rows.filter((row) => row.sessionDate === latestSessionDate)
        : rows;
      const points = [...selectedRows]
        .sort((left, right) => left.bucketStart.getTime() - right.bucketStart.getTime())
        .map((row) => ({
          time: row.bucketStart.toISOString(),
          price: row.close,
          volume: definition.hasVolume ? row.volume : null,
          open: row.open,
          high: row.high,
          low: row.low,
        }));
      return {
        symbol: definition.symbol,
        name: definition.name,
        points,
        sessionDate: selectedRows.at(-1)?.sessionDate ?? null,
        hasVolume: definition.hasVolume,
        quality: "available",
        staleReason: null,
      };
    },
  };
}

export const marketAssetReader = createMarketAssetReader();
