import {
  nextMarketTab,
  type MarketBriefQueryParams,
} from "./market-brief.ts";

export type MarketSelectionState = MarketBriefQueryParams;

export const ETF_SYMBOLS = ["510300.SH", "588000.SH", "159992.SZ"] as const;
export const GLOBAL_SYMBOLS = ["XAUUSD", "IXIC"] as const;

export function initialMarketSelection(): MarketSelectionState {
  return {
    symbol: "000001.SH",
    range: "1D",
    etfSymbol: "510300.SH",
    etfRange: "1D",
    globalSymbol: "XAUUSD",
    globalRange: "1D",
  };
}

export type MarketSelectionAction =
  | { type: "index"; symbol: MarketSelectionState["symbol"] }
  | { type: "etf"; symbol: MarketSelectionState["etfSymbol"] }
  | { type: "global"; symbol: MarketSelectionState["globalSymbol"] }
  | { type: "etf-key"; key: "ArrowLeft" | "ArrowRight" | "Home" | "End" }
  | {
      type: "range";
      domain: "index" | "etf" | "global";
      range: MarketSelectionState["range"];
    };

export function reduceMarketSelection(
  state: MarketSelectionState,
  action: MarketSelectionAction,
): MarketSelectionState {
  if (action.type === "index") return { ...state, symbol: action.symbol };
  if (action.type === "etf") return { ...state, etfSymbol: action.symbol };
  if (action.type === "global") return { ...state, globalSymbol: action.symbol };
  if (action.type === "etf-key") {
    return {
      ...state,
      etfSymbol: nextMarketTab(ETF_SYMBOLS, state.etfSymbol, action.key),
    };
  }
  if (action.domain === "index") return { ...state, range: action.range };
  if (action.domain === "etf") return { ...state, etfRange: action.range };
  return { ...state, globalRange: action.range };
}
