import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseStockWorkspaceSearch, stockWorkspaceSearch } from "../../../../lib/stock-workspace";
import { normalizeStockSymbol } from "../../../../lib/stock-analysis";

export const Route = createFileRoute("/home/market/analysis/$symbol")({
  beforeLoad: ({ location, params }) => {
    const source = location.search as Record<string, unknown>;
    const parsed = parseStockWorkspaceSearch(source);
    throw redirect({
      to: "/home/market/stock/$symbol",
      params: { symbol: normalizeStockSymbol(params.symbol) ?? params.symbol },
      search: stockWorkspaceSearch({
        ...parsed,
        mode: "research",
        tf: source.tf ? parsed.tf : undefined,
      }),
      replace: true,
    });
  },
});
