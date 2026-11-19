import { createFileRoute, useParams } from "@tanstack/react-router";
import { StockAnalysisDetail } from "./-private/StockAnalysisDetail";
import { normalizeStockSymbol } from "../../../../lib/stock-analysis";

export const Route = createFileRoute("/home/market/analysis/$symbol")({
  component: StockAnalysisRoute,
});

function StockAnalysisRoute() {
  const { symbol } = useParams({ from: "/home/market/analysis/$symbol" });
  return <StockAnalysisDetail symbol={normalizeStockSymbol(symbol) ?? symbol} />;
}
