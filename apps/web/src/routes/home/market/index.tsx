import { createFileRoute } from "@tanstack/react-router";
import { UnderConstructionPage } from "../../../components/UnderConstructionPage";

export const Route = createFileRoute("/home/market/")({
  component: MarketPage,
});

function MarketPage() {
  return (
    <UnderConstructionPage
      title="行情中心"
      description="统一观察市场行情、板块变化和资金结构。"
    />
  );
}
