import { ArrowUpRight } from "lucide-react";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import {
  buildLimitUpConcentration,
  formatMoney,
  sealRate,
  type MarketCenterOverviewResponse,
} from "../../../../lib/market-center";

type OverviewAnomaly = MarketCenterOverviewResponse["anomalies"]["items"][number];

const STAT_SURFACE =
  "color-mix(in srgb, var(--surface) 58%, var(--panel))";

interface MarketTemperaturePanelProps {
  limitUp: MarketCenterOverviewResponse["limitUp"];
  industryFund: OverviewAnomaly | undefined;
  conceptFund: OverviewAnomaly | undefined;
}

function compactDate(value: string | null): string {
  if (!value) return "暂无快照";
  return `${value.slice(5, 10).replace("-", "/")} 收盘`;
}

function FundLink({
  label,
  item,
}: {
  label: "行业资金" | "概念资金";
  item: OverviewAnomaly | undefined;
}) {
  if (!item) {
    return (
      <div className="min-h-28 rounded-xl border border-app-line bg-app-panel px-3 py-3">
        <span className="inline-flex rounded-md bg-app-surface px-2 py-1 text-[9px] text-app-muted">
          {label}
        </span>
        <p className="mt-3 text-[11px] text-app-muted">暂无可用资金证据</p>
      </div>
    );
  }
  return (
    <a
      href={item.href}
      className="focus-ring group flex min-h-28 min-w-0 flex-col rounded-xl border border-app-line bg-app-panel px-3 py-3 transition-colors hover:bg-primary/[0.03]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex rounded-md bg-primary/8 px-2 py-1 text-[9px] font-semibold text-primary">
          {label}
        </span>
        <ArrowUpRight className="size-3.5 text-app-muted transition group-hover:text-primary" />
      </div>
      <strong className="mt-2.5 block text-xs leading-5 text-app-ink">{item.title}</strong>
      <div className="mt-auto pt-2">
        <span className="block text-[10px] font-medium text-app-ink-secondary">
          {item.evidence}
        </span>
        <time
          dateTime={item.asOf.slice(0, 10)}
          className="mt-1 block whitespace-nowrap font-mono text-[10px] text-app-muted"
        >
          {item.asOf.slice(0, 10)}
        </time>
      </div>
    </a>
  );
}

export function MarketTemperaturePanel({
  limitUp,
  industryFund,
  conceptFund,
}: MarketTemperaturePanelProps) {
  const concentration = buildLimitUpConcentration(limitUp.leaders, limitUp.total);
  const sealedRate = sealRate(limitUp.total, limitUp.openedCount);

  return (
    <Card className="flex min-h-[560px] flex-col overflow-hidden rounded-3xl">
      <div className="flex items-start justify-between border-b border-app-line px-5 py-4">
        <div>
          <Heading level={2} className="text-base">市场温度</Heading>
          <Text type="supporting" as="p" className="mt-1 text-[11px]">
            涨停池与连板结构
          </Text>
        </div>
        <span className="rounded-full bg-app-surface px-2.5 py-1.5 font-mono text-[10px] text-app-muted">
          {compactDate(limitUp.asOf)}
        </span>
      </div>

      {limitUp.status !== "missing" ? (
        <div className="flex flex-1 flex-col px-4 py-4">
          <div className="flex items-end justify-between gap-3">
            <p className="font-mono text-[48px] font-bold leading-none tracking-[-0.06em] text-app-ink">
              {limitUp.total}
              <small className="ml-1 font-sans text-[11px] font-normal tracking-normal text-app-muted">
                家涨停
              </small>
            </p>
            <span className="rounded-md bg-chart-up/10 px-2.5 py-1.5 text-[11px] font-semibold text-chart-up-strong">
              最高 {limitUp.maxBoard} 板
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["封板率", sealedRate == null ? "—" : `${sealedRate.toFixed(1)}%`],
              ["最大封单", formatMoney(limitUp.maxSealAmount)],
              ["平均换手", `${limitUp.avgTurnover.toFixed(2)}%`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl px-2.5 py-2.5"
                style={{ background: STAT_SURFACE }}
              >
                <span className="block text-[10px] text-app-muted">{label}</span>
                <strong className="mt-1 block font-mono text-xs text-app-ink">{value}</strong>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-app-line">
            {limitUp.ladder.map((item) => (
              <div
                key={item.count}
                className="grid min-h-9 grid-cols-[44px_minmax(0,1fr)_24px] items-center gap-2 border-b border-app-line/60 text-[11px] last:border-0"
              >
                <b className="font-mono text-chart-up-strong">{item.count} 板</b>
                <span className="truncate text-app-ink-secondary">
                  {item.names.slice(0, 3).join(" · ")}
                </span>
                <span className="text-right font-mono text-app-muted">{item.names.length}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4">
            <div className="grid grid-cols-2 gap-2">
              <FundLink label="行业资金" item={industryFund} />
              <FundLink label="概念资金" item={conceptFund} />
            </div>

            <div className="mt-4 border-t border-app-line pt-3">
              <div className="mb-1 flex items-center justify-between">
                <strong className="text-[11px] text-app-ink">涨停行业集中度</strong>
                <span className="text-[9px] text-app-muted">涨停池占比</span>
              </div>
              {concentration.map((item) => (
                <div
                  key={item.industry}
                  className="grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[10px]"
                >
                  <span className="truncate text-app-ink-secondary">{item.industry}</span>
                  <b className="font-mono font-semibold text-chart-up-strong">
                    {item.count} 家 · {item.percent.toFixed(1)}%
                  </b>
                </div>
              ))}
              {concentration.length === 0 ? (
                <p className="py-3 text-[10px] text-app-muted">暂无涨停行业集中样本</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center text-xs text-app-muted">
          市场温度暂无数据
        </p>
      )}
    </Card>
  );
}
