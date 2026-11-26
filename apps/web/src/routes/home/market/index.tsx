import { createFileRoute } from "@tanstack/react-router";
import { useMarketCenterOverview } from "../../../hooks/useMarketCenter";
import { marketBreadthNarrative } from "../../../lib/market-center";
import { CrossAssetRotationPanel } from "./-private/CrossAssetRotationPanel";
import { MainIndexPanel } from "./-private/MainIndexPanel";
import { MarketTemperaturePanel } from "./-private/MarketTemperaturePanel";
import {
  MarketCenterError,
  MarketCenterShell,
} from "./-private/MarketCenterShell";

export const Route = createFileRoute("/home/market/")({
  component: MarketCenterOverviewPage,
});

function MarketCenterOverviewPage() {
  return (
    <MarketCenterShell>
      <MarketCenterOverviewContent />
    </MarketCenterShell>
  );
}

function MarketCenterOverviewContent() {
  const overview = useMarketCenterOverview();

  if (overview.isLoading) {
    return <div className="h-[520px] animate-pulse rounded-3xl bg-app-surface" />;
  }
  if (overview.isError || !overview.data) {
    return (
      <MarketCenterError
        title="行情总览暂时无法读取"
        message={overview.error instanceof Error ? overview.error.message : "请稍后重试"}
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const breadth = overview.data.breadth;
  const limitUp = overview.data.limitUp;
  const growth = overview.data.growthDefense.growthDefense?.current;
  const breadthNarrative = marketBreadthNarrative({
    industry: breadth.industry,
    growthRelative20d: growth?.relativeReturn20d ?? null,
    growthState: growth?.state ?? "中间区",
  });
  const industryFund = overview.data.anomalies.items.find(
    (item) => item.category === "industry",
  );
  const conceptFund = overview.data.anomalies.items.find(
    (item) => item.category === "concept",
  );
  return (
    <div className="space-y-3">
      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.65fr)]">
        <MainIndexPanel
          data={overview.data.mainIndices}
          growthDefense={overview.data.growthDefense}
          breadth={{
            industry: breadth.industry,
            asOf: breadth.asOf,
            narrative: breadthNarrative,
          }}
        />
        <MarketTemperaturePanel
          limitUp={limitUp}
          industryFund={industryFund}
          conceptFund={conceptFund}
        />
      </div>

      <CrossAssetRotationPanel />
    </div>
  );
}
