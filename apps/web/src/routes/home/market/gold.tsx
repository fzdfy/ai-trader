import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@preline-ui/Badge";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { MarketAssetChart } from "../../../components/charts/MarketAssetChart";
import { SignalDiagnosis } from "../../../components/signals/SignalDiagnosis";
import { groupSignalsByLayer } from "../../../components/signals/signal-utils";
import { useMarketBriefQuery } from "../../../hooks/useMarketBrief";
import { useTechnicalSignalSnapshot } from "../../../hooks/useTechnicalSignals";
import { formatChangePct, formatMarketNumber } from "../../../lib/market-brief";
import { MarketCenterShell } from "./-private/MarketCenterShell";

export const Route = createFileRoute("/home/market/gold")({
  component: GoldAnalysisPage,
});

function GoldAnalysisPage() {
  const market = useMarketBriefQuery({
    symbol: "000001.SH",
    range: "1D",
    etfSymbol: "510300.SH",
    etfRange: "1D",
    globalSymbol: "XAUUSD",
    globalRange: "1M",
  });
  const technical = useTechnicalSignalSnapshot("gold", "XAUUSD");
  const ticker = market.data?.tickers.find((item) => item.symbol === "XAUUSD");
  const chart = market.data?.globalChart;

  return (
    <MarketCenterShell>
      <div className="space-y-3">
        <nav
          className="flex flex-wrap items-center gap-1.5 text-[11px] text-app-muted"
          aria-label="面包屑"
        >
          <Link to="/home" className="focus-ring rounded text-primary hover:underline">
            Apollo Quant
          </Link>
          <span>/</span>
          <Link to="/home/market" className="focus-ring rounded text-primary hover:underline">
            行情中心
          </Link>
          <span>/</span>
          <span aria-current="page">黄金分析</span>
        </nav>

        <Card className="overflow-hidden">
          <div className="grid gap-4 border-b border-app-line p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-primary">
                GOLD · XAU/USD
              </span>
              <div className="mt-1 flex flex-wrap items-end gap-3">
                <Heading level={1} className="text-3xl tracking-tight">
                  伦敦金
                </Heading>
                <Badge variant="neutral">美元 / 盎司</Badge>
                <strong className="font-mono text-2xl text-app-ink">
                  {formatMarketNumber(ticker?.price ?? null)}
                </strong>
                <span
                  className={`font-mono text-xs ${
                    (ticker?.changePct ?? 0) >= 0
                      ? "text-chart-up-strong"
                      : "text-chart-down-strong"
                  }`}
                >
                  {formatChangePct(ticker?.changePct ?? null)}
                </span>
              </div>
              <Text as="p" type="supporting" className="mt-2 max-w-2xl leading-6">
                XAU/USD 没有可信成交量；RVOL、OBV 等量能信号固定标记为“不适用”。
              </Text>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] text-app-muted">
              <span className="rounded-full bg-app-surface px-2.5 py-1">数据粒度 · 日线</span>
              <span className="rounded-full bg-app-surface px-2.5 py-1">宏观模型 · 待接入</span>
              <span className="rounded-full bg-app-surface px-2.5 py-1">无成交量</span>
            </div>
          </div>
          <div className="p-3">
            {chart && chart.points.length > 0 ? (
              <MarketAssetChart chart={chart} subjectName="伦敦金" tone="warning" />
            ) : (
              <div className="grid min-h-64 place-items-center text-center text-xs text-app-muted">
                黄金日线暂不可用
              </div>
            )}
          </div>
        </Card>

        <SignalDiagnosis
          title="黄金技术诊断"
          description="价格结构、形态和宏观模型在同一张卡内分层查看；未接入数据不生成代理结论。"
          layers={groupSignalsByLayer(technical.data?.signals ?? [])}
          asOf={technical.data?.asOf}
          catalogVersion={technical.data?.catalogVersion}
          isLoading={technical.isLoading}
          error={
            technical.isError
              ? technical.error instanceof Error
                ? technical.error.message
                : "黄金信号快照暂时不可用"
              : null
          }
          partialMessage="XAU/USD 量能信号为“不适用”；宏观、持仓、ETF 与期权数据未接入时保持“不可用”。"
          onRetry={() => void technical.refetch()}
        />
      </div>
    </MarketCenterShell>
  );
}
