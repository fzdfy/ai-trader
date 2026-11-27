import type { KlineTf } from "../hooks/useInstruments.ts";
import { normalizeStockSymbol } from "./stock-analysis.ts";
import type { StockListTab } from "./stock-list-state.ts";

export type StockWorkspaceMode = "quick" | "research";

export interface StockWorkspaceSearch {
  mode?: StockWorkspaceMode;
  tf?: KlineTf;
  from?: string;
  list?: string;
  listTab?: StockListTab;
  listPage?: number;
  listQ?: string;
}

export type ParsedStockWorkspaceSearch = Omit<StockWorkspaceSearch, "mode" | "tf"> & {
  mode: StockWorkspaceMode;
  tf: KlineTf;
};

const KLINE_PERIODS = new Set<KlineTf>(["1m", "1d", "5d", "1w", "1mo"]);

export function parseStockWorkspaceMode(value: unknown): StockWorkspaceMode {
  return value === "research" ? "research" : "quick";
}

export function shouldLoadStockResearch(mode: StockWorkspaceMode): boolean {
  return mode === "research";
}

export function parseStockWorkspaceSearch(
  search: Record<string, unknown>,
): ParsedStockWorkspaceSearch {
  const tf =
    typeof search.tf === "string" && KLINE_PERIODS.has(search.tf as KlineTf)
      ? (search.tf as KlineTf)
      : "1d";
  const page = Number(search.listPage);
  return {
    mode: parseStockWorkspaceMode(search.mode),
    tf,
    from: typeof search.from === "string" ? search.from : undefined,
    list: typeof search.list === "string" ? search.list : undefined,
    listTab:
      search.listTab === "watchlist"
        ? "watchlist"
        : search.listTab === "stock"
          ? "stock"
          : undefined,
    listPage: Number.isInteger(page) && page > 0 ? page : undefined,
    listQ: typeof search.listQ === "string" ? search.listQ : undefined,
  };
}

export function stockWorkspaceSearch(
  search: StockWorkspaceSearch & { mode: StockWorkspaceMode },
): StockWorkspaceSearch & { mode: StockWorkspaceMode } {
  return {
    mode: search.mode,
    ...(search.tf ? { tf: search.tf } : {}),
    ...(search.from ? { from: search.from } : {}),
    ...(search.list ? { list: search.list } : {}),
    ...(search.listTab ? { listTab: search.listTab } : {}),
    ...(search.listPage ? { listPage: search.listPage } : {}),
    ...(search.listQ ? { listQ: search.listQ } : {}),
  };
}

export function stockWorkspacePath(inputSymbol: string, search: StockWorkspaceSearch = {}): string {
  const symbol = normalizeStockSymbol(inputSymbol) ?? inputSymbol.trim().toUpperCase();
  const params = new URLSearchParams();
  const mode = search.mode ?? "quick";

  if (mode === "research") params.set("mode", "research");
  if (search.tf) params.set("tf", search.tf);
  if (search.from) params.set("from", search.from);
  if (search.list) params.set("list", search.list);
  if (search.listTab) params.set("listTab", search.listTab);
  if (search.listPage) params.set("listPage", String(search.listPage));
  if (search.listQ) params.set("listQ", search.listQ);

  const query = params.toString();
  return `/home/market/stock/${encodeURIComponent(symbol)}${query ? `?${query}` : ""}`;
}

export function stockWorkspaceRedirect(
  inputSymbol: string,
  search: Omit<StockWorkspaceSearch, "mode"> = {},
): string {
  return stockWorkspacePath(inputSymbol, { ...search, mode: "research" });
}
