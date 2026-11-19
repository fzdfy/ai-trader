import { createFileRoute } from "@tanstack/react-router";
import { StockAnalysisLanding } from "./-private/StockAnalysisLanding";

export const Route = createFileRoute("/home/market/analysis/")({
  component: StockAnalysisLanding,
});
