import { createFileRoute } from "@tanstack/react-router";
import { useMarketCenterOverview } from "../../../hooks/useMarketCenter";
import { useTechnicalSignalSnapshot } from "../../../hooks/useTechnicalSignals";
import { marketBreadthNarrative } from "../../../lib/market-center";
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

  const breadth = overview.data.breadth;
  const limitUp = overview.data.limitUp;
  const growth = overview.data.growthDefense.growthDefense?.current;
  const breadthNarrative = marketBreadthNarrative({
    industry: breadth.industry,
    growthRelative20d: growth?.relativeReturn20d ?? null,
    growthState: growth?.state ?? "中间区",
  });
  const industryFund = overview.data.anomalies.items.find((item) => item.category === "industry");
  const conceptFund = overview.data.anomalies.items.find((item) => item.category === "concept");
  const technicalSignals = technical.data?.signals ?? [];
  const technicalLayers = groupSignalsByLayer(technicalSignals);
  const counts = signalCounts(technicalSignals);
  const riskOn = technicalSignals.find(
    (signal) => signal.signalId === "advanced.market.risk_on_off",
  );
  const stateLabel =
    counts.triggered > 0
      ? riskOn?.direction === "risk"
        ? "风险偏好收缩，等待广度确认"
        : "证据分化，维持中性观察"
      : "市场状态待确认";
  return (
    <div className="space-y-3">
      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.65fr)]">
        <MainIndexPanel
          data={overview.data.mainIndices}
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

      <SignalDiagnosis
        title="A 股宏观状态"
        description="基础、K 线形态和高级模型在同一模块内切换；成长/红利低波只作为风格轮动证据出现。"
        layers={technicalLayers}
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
        headerContent={
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
                综合判断
              </span>
              <strong className="mt-1 block text-base text-app-ink">{stateLabel}</strong>
              <p className="mt-1 text-[11px] leading-5 text-app-muted">
                主要指数和市场温度保留原有职责；本模块聚合宏观状态与完整证据。
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-app-muted">
              <span className="rounded-full bg-app-surface px-2 py-1">
                已触发 {counts.triggered}
              </span>
              <span className="rounded-full bg-app-surface px-2 py-1">
                低置信 {counts["low-confidence"]}
              </span>
              <span className="rounded-full bg-app-surface px-2 py-1">
                待接入 {counts.unavailable}
              </span>
            </div>
          </div>
        }
      />

      <CrossAssetRotationPanel />
    </div>
  );
}
