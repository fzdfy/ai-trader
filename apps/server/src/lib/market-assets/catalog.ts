export const MARKET_ASSET_SYMBOLS = [
  "000001.SH",
  "399006.SZ",
  "510300.SH",
  "588000.SH",
  "159992.SZ",
  "XAUUSD",
  "IXIC",
] as const;

export type MarketAssetSymbol = (typeof MARKET_ASSET_SYMBOLS)[number];
export type MarketAssetSession = "a_share" | "global_gold" | "us_equity";

export interface MarketAssetDefinition {
  symbol: MarketAssetSymbol;
  name: string;
  priceUnit: string;
  session: MarketAssetSession;
  hasVolume: boolean;
}

export const MARKET_ASSETS: Record<MarketAssetSymbol, MarketAssetDefinition> = {
  "000001.SH": {
    symbol: "000001.SH",
    name: "上证指数",
    priceUnit: "点",
    session: "a_share",
    hasVolume: true,
  },
  "399006.SZ": {
    symbol: "399006.SZ",
    name: "创业板指",
    priceUnit: "点",
    session: "a_share",
    hasVolume: true,
  },
  "510300.SH": {
    symbol: "510300.SH",
    name: "沪深300ETF",
    priceUnit: "元",
    session: "a_share",
    hasVolume: true,
  },
  "588000.SH": {
    symbol: "588000.SH",
    name: "科创50ETF",
    priceUnit: "元",
    session: "a_share",
    hasVolume: true,
  },
  "159992.SZ": {
    symbol: "159992.SZ",
    name: "创新药ETF",
    priceUnit: "元",
    session: "a_share",
    hasVolume: true,
  },
  XAUUSD: {
    symbol: "XAUUSD",
    name: "伦敦金",
    priceUnit: "USD/oz",
    session: "global_gold",
    hasVolume: false,
  },
  IXIC: {
    symbol: "IXIC",
    name: "纳斯达克综合指数",
    priceUnit: "点",
    session: "us_equity",
    hasVolume: false,
  },
};

export function resolveMarketAsset(symbol: string): MarketAssetDefinition {
  const normalized = symbol.trim().toUpperCase();
  if (!(normalized in MARKET_ASSETS)) {
    throw new Error(`unknown market asset: ${symbol}`);
  }
  return MARKET_ASSETS[normalized as MarketAssetSymbol];
}
