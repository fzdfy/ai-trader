import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Pagination } from "@preline-ui/Pagination";
import { Text } from "@preline-ui/Text";
import { useBoardsQuery } from "../../../../hooks/useBoards";
import { useBoardFundFlow, useMarketRotation } from "../../../../hooks/useMarketCenter";
import { useHeatmapBoardQuery } from "../../../../hooks/useHeatmap";
import { useTechnicalSignalSnapshot } from "../../../../hooks/useTechnicalSignals";
import { SignalDiagnosis } from "../../../../components/signals/SignalDiagnosis";
import { groupSignalsByLayer } from "../../../../components/signals/signal-utils";
import {
  formatMoney,
  formatRotationValue,
  paginateRows,
  paginationTokens,
  rotationQualityLabel,
} from "../../../../lib/market-center";
import type { RotationWindow } from "../../../../lib/market-center";
import { FundStructure } from "../-private/FundStructure";
import { MarketCenterError, MarketCenterShell } from "../-private/MarketCenterShell";

export const Route = createFileRoute("/home/market/boards/$code")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { type: "industry" | "concept"; window?: RotationWindow } => ({
    type: search.type === "concept" ? "concept" : "industry",
    window: search.window === "5D" || search.window === "60D" ? search.window : "20D",
  }),
  component: BoardDetailPage,
});

function BoardDetailPage() {
  return (
    <MarketCenterShell>
      <BoardDetailContent />
    </MarketCenterShell>
  );
}

function BoardDetailContent() {
  const [constituentPage, setConstituentPage] = useState(1);
  const { code } = Route.useParams();
  const { type, window: rotationWindow = "20D" } = Route.useSearch();
  const navigate = useNavigate();
  const boards = useBoardsQuery(type);
  const rotation = useMarketRotation(type, rotationWindow);
  const constituents = useHeatmapBoardQuery(type, code, true);
  const funds = useBoardFundFlow(code, 5);
  const technical = useTechnicalSignalSnapshot("sector", code, type);
  const board = boards.data?.find((item) => item.code === code);
  const rotationRow = rotation.data?.rows.find((item) => item.code === code);
  const latestFund = funds.data?.at(-1);
  const pagedConstituents = paginateRows(constituents.data ?? [], constituentPage);

  useEffect(() => {
    setConstituentPage(1);
  }, [code]);

  if (boards.isLoading) {
    return <div className="h-[520px] animate-pulse rounded-3xl bg-app-surface" />;
  }
  if (boards.isError || !board) {
    return (
      <MarketCenterError
        title="板块详情暂时无法读取"
        message="该板块可能已不在最新快照中，或当前分类不正确。"
        onRetry={() => void boards.refetch()}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/home/market/boards"
          search={{ type, window: rotationWindow }}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-app-line px-2.5 text-[11px] font-semibold text-app-ink-secondary hover:bg-app-surface"
        >
          <ArrowLeft className="size-3.5" /> 返回板块
        </Link>
        <Text type="supporting" className="text-[11px]">
          板块详情 · {code}
        </Text>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <Card className="overflow-hidden rounded-2xl">
          <div className="bg-gradient-to-br from-primary/5 to-transparent px-5 py-4">
            <Text type="supporting" as="p" className="font-mono text-[11px] text-primary">
              {type === "industry" ? "INDUSTRY ROTATION" : "CONCEPT ROTATION"}
            </Text>
            <Heading level={2} className="mt-1 text-2xl">
              {board.name}
            </Heading>
            <Text type="supporting" as="p" className="mt-1 text-[11px]">
              {code} · 排名 {rotationRow?.rank ?? board.rank}
            </Text>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                [
                  "当前涨跌",
                  board.changePercent ? `${Number(board.changePercent).toFixed(2)}%` : "—",
                ],
                [
                  `${rotationWindow.replace("D", " 日")} 相对`,
                  formatRotationValue(rotationRow?.relativeReturn ?? null),
                ],
                ["主力净流入", formatMoney(latestFund?.mainNetInflow ?? null)],
                [
                  "资金质量",
                  funds.isError ? "缺失" : rotationQualityLabel(rotation.data?.status ?? "missing"),
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-app-panel/75 px-3 py-2.5">
                  <span className="block text-[10px] text-app-muted">{label}</span>
                  <strong className="mt-1 block font-mono text-sm text-app-ink">{value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-app-line px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <strong className="text-xs text-app-ink">资金结构</strong>
              <span className="text-[11px] text-app-muted">
                {latestFund?.date ?? "暂无资金快照"}
              </span>
            </div>
            <FundStructure row={latestFund} isLoading={funds.isLoading} isError={funds.isError} />
            <p className="mt-2 text-[11px] leading-5 text-app-muted">
              主力净流入按数据源的大单与超大单口径汇总，不等同于全部资金。
            </p>
          </div>
        </Card>

        <Card className="overflow-hidden rounded-2xl">
          <div className="border-b border-app-line px-4 py-3">
            <Heading level={2} className="text-sm">
              轮动位置
            </Heading>
            <Text type="supporting" as="p" className="mt-1 text-[11px]">
              相对强弱 × 排名改善
            </Text>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {[
              ["阶段", rotationRow?.phase ?? "待确认"],
              ["排名变化", rotationRow?.rankChange == null ? "—" : String(rotationRow.rankChange)],
              ["资金确认", formatMoney(rotationRow?.moneyConfirmation ?? null)],
              ["数据状态", rotationQualityLabel(rotationRow?.quality ?? "missing")],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-app-surface p-3">
                <span className="block text-[10px] text-app-muted">{label}</span>
                <strong className="mt-1 block text-xs text-app-ink">{value}</strong>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <SignalDiagnosis
        title="板块技术诊断"
        description="板块指数、成分广度与高级轮动证据统一在一张卡内查看。"
        layers={groupSignalsByLayer(technical.data?.signals ?? [])}
        judgment={technical.data?.summary}
        asOf={technical.data?.asOf}
        catalogVersion={technical.data?.catalogVersion}
        isLoading={technical.isLoading}
        error={
          technical.isError
            ? technical.error instanceof Error
              ? technical.error.message
              : "板块信号快照暂时不可用"
            : null
        }
        partialMessage="形态触发必须获得成分股广度或龙头共振确认，单根板块指数 K 线不能独立完成判断。"
        onRetry={() => void technical.refetch()}
      />

      <Card className="overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-app-line px-4 py-3">
          <div>
            <Heading level={2} className="text-sm">
              成分股
            </Heading>
            <Text type="supporting" as="p" className="mt-1 text-[11px]">
              点击股票进入快速行情详情
            </Text>
          </div>
          <span className="font-mono text-[11px] text-app-muted">
            {constituents.data?.length ?? 0} 只
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-app-surface/70 text-left text-[11px] text-app-muted">
                <th className="px-4 py-2.5 font-medium">股票</th>
                <th className="px-3 py-2.5 text-right font-medium">涨跌幅</th>
                <th className="px-3 py-2.5 text-right font-medium">换手率</th>
                <th className="px-4 py-2.5 text-right font-medium">查看</th>
              </tr>
            </thead>
            <tbody>
              {pagedConstituents.rows.map((item) => (
                <tr
                  key={item.code}
                  className="focus-ring cursor-pointer border-t border-app-line/60 hover:bg-primary/5"
                  role="link"
                  tabIndex={0}
                  aria-label={`查看 ${item.name} 行情详情`}
                  onClick={() =>
                    void navigate({
                      to: "/home/market/stock/$symbol",
                      params: { symbol: item.code },
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    void navigate({
                      to: "/home/market/stock/$symbol",
                      params: { symbol: item.code },
                    });
                  }}
                >
                  <td className="px-4 py-2.5">
                    <strong className="block text-xs text-app-ink">{item.name}</strong>
                    <span className="mt-0.5 block font-mono text-[11px] text-app-muted">
                      {item.code}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono font-semibold ${
                      (item.changePercent ?? 0) >= 0
                        ? "text-chart-up-strong"
                        : "text-chart-down-strong"
                    }`}
                  >
                    {item.changePercent == null
                      ? "—"
                      : `${item.changePercent > 0 ? "+" : ""}${item.changePercent.toFixed(2)}%`}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-app-muted">
                    {item.turnoverRate == null ? "—" : `${item.turnoverRate.toFixed(2)}%`}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[11px] font-semibold text-primary">
                    行情
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!constituents.isLoading && (constituents.data?.length ?? 0) === 0 ? (
            <p className="py-12 text-center text-xs text-app-muted">成分股暂无缓存</p>
          ) : null}
        </div>
        {(constituents.data?.length ?? 0) > 0 ? (
          <Pagination
            label="成分股分页"
            page={pagedConstituents.page}
            pageCount={pagedConstituents.totalPages}
            total={constituents.data?.length ?? 0}
            rangeStart={pagedConstituents.rangeStart}
            rangeEnd={pagedConstituents.rangeEnd}
            tokens={paginationTokens(pagedConstituents.page, pagedConstituents.totalPages)}
            onPageChange={setConstituentPage}
          />
        ) : null}
      </Card>
    </div>
  );
}
