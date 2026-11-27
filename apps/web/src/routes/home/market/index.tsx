import { createFileRoute } from "@tanstack/react-router";
import { useMarketCenterOverview } from "../../../hooks/useMarketCenter";
import { useTechnicalSignalSnapshot } from "../../../hooks/useTechnicalSignals";
import { SignalDiagnosis } from "../../../components/signals/SignalDiagnosis";
import { groupSignalsByLayer, signalCounts } from "../../../components/signals/signal-utils";
import { CrossAssetRotationPanel } from "./-private/CrossAssetRotationPanel";
import { MainIndexPanel } from "./-private/MainIndexPanel";
import { MarketTemperaturePanel } from "./-private/MarketTemperaturePanel";
import { MarketCenterError, MarketCenterShell } from "./-private/MarketCenterShell";

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
  const technical = useTechnicalSignalSnapshot("market", "000001.SH");

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

  const limitUp = overview.data.limitUp;
  const industryFund = overview.data.anomalies.items.find((item) => item.category === "industry");
  const conceptFund = overview.data.anomalies.items.find((item) => item.category === "concept");
  const technicalSignals = technical.data?.signals ?? [];
  const technicalLayers = groupSignalsByLayer(technicalSignals);
  const counts = signalCounts(technicalSignals);
  return (
    <div className="space-y-3">
      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.65fr)]">
        <MainIndexPanel data={overview.data.mainIndices} />
        <MarketTemperaturePanel
          limitUp={limitUp}
          industryFund={industryFund}
          conceptFund={conceptFund}
        />
      </div>

      <SignalDiagnosis
        title="A 股宏观状态"
        description="对象总判断由基础、K 线形态和高级模型三个核心层形成；缺失和低置信证据不参与方向投票。"
        layers={technicalLayers}
        judgment={technical.data?.summary}
        asOf={technical.data?.asOf}
        catalogVersion={technical.data?.catalogVersion}
        isLoading={technical.isLoading}
        error={
          technical.isError
            ? technical.error instanceof Error
              ? technical.error.message
              : "技术信号快照暂时不可用"
            : null
        }
        partialMessage={
          counts.unavailable > 0
            ? `${counts.unavailable} 项宏观或模型数据尚未接入；可用技术证据仍继续展示。`
            : null
        }
        onRetry={() => void technical.refetch()}
      />

      <CrossAssetRotationPanel />
    </div>
  );
}
