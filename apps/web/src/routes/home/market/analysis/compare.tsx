import { createFileRoute } from "@tanstack/react-router";
import { normalizeCompareSymbols } from "../../../../lib/stock-analysis";
import { StockComparison } from "./-private/StockComparison";

export const Route = createFileRoute("/home/market/analysis/compare")({
  validateSearch: (search: Record<string, unknown>): { symbols?: string } => ({
    symbols: typeof search.symbols === "string" ? search.symbols : undefined,
  }),
  component: StockComparisonRoute,
});

function StockComparisonRoute() {
  const { symbols } = Route.useSearch();
  return <StockComparison symbols={normalizeCompareSymbols((symbols ?? "").split(","))} />;
}
