export const STOCK_LIST_PAGE_SIZE = 10;

export type StockListTab = "stock" | "watchlist";

export interface StockListSearch {
  tab: StockListTab;
  page: number;
  q: string;
}

export interface StockDetailReturnSearch {
  from: "market-stock";
  listTab: StockListTab;
  listPage: number;
  listQ: string;
}

function positiveInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseStockListSearch(search: Record<string, unknown>): StockListSearch {
  return {
    tab: search.tab === "watchlist" ? "watchlist" : "stock",
    page: positiveInteger(search.page),
    q: typeof search.q === "string" ? search.q.trim() : "",
  };
}

export function normalizeStockPage(page: number, totalPages: number): number {
  return totalPages > 0
    ? Math.min(positiveInteger(page), Math.floor(totalPages))
    : 1;
}

export function stockPageRange(
  page: number,
  rowCount: number,
  total: number,
): { rangeStart: number; rangeEnd: number } {
  if (total === 0 || rowCount === 0) return { rangeStart: 0, rangeEnd: 0 };
  const start = (normalizeStockPage(page, Math.ceil(total / STOCK_LIST_PAGE_SIZE)) - 1) *
    STOCK_LIST_PAGE_SIZE;
  return {
    rangeStart: start + 1,
    rangeEnd: Math.min(start + rowCount, total),
  };
}

export function toStockDetailSearch(search: StockListSearch): StockDetailReturnSearch {
  return {
    from: "market-stock",
    listTab: search.tab,
    listPage: search.page,
    listQ: search.q,
  };
}

export function toStockReturnSearch(search: {
  listTab?: unknown;
  listPage?: unknown;
  listQ?: unknown;
}): StockListSearch {
  return parseStockListSearch({
    tab: search.listTab,
    page: search.listPage,
    q: search.listQ,
  });
}

export function watchlistPageQueryKey(
  userId: string,
  q: string,
  page: number,
  limit: number,
) {
  return ["watchlistInstruments", userId, "page", q, page, limit] as const;
}
