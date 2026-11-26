import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { useBoardsQuery } from "../../../../hooks/useBoards";
import { useMarketRotation } from "../../../../hooks/useMarketCenter";
import {
  MARKET_CAP_HEATMAP_LIMIT,
  type RotationWindow,
} from "../../../../lib/market-center";
import { BoardHeatmap } from "../-private/BoardHeatmap";
import { MarketBoardAnomaly } from "../-private/MarketBoardAnomaly";
import { MarketBoardRanking } from "../-private/MarketBoardRanking";
import { MarketBoardRotation } from "../-private/MarketBoardRotation";
import { MarketCenterError, MarketCenterShell } from "../-private/MarketCenterShell";

export const Route = createFileRoute("/home/market/boards/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { type: "industry" | "concept"; window?: RotationWindow } => ({
    type: search.type === "concept" ? "concept" : "industry",
    window: search.window === "5D" || search.window === "60D" ? search.window : "20D",
  }),
  component: BoardsPage,
});

function BoardsPage() {
  return (
    <MarketCenterShell>
      <BoardsContent />
    </MarketCenterShell>
  );
}

function BoardsContent() {
  const navigate = useNavigate();
  const { type, window: rotationWindow = "20D" } = Route.useSearch();
  const boards = useBoardsQuery(type);
  const rotation = useMarketRotation(type, rotationWindow);
  const openBoard = (code: string) => {
    void navigate({
      to: "/home/market/boards/$code",
      params: { code },
      search: { type, window: rotationWindow },
    });
  };

  if (boards.isLoading || rotation.isLoading) {
    return <div className="h-[520px] animate-pulse rounded-3xl bg-app-surface" />;
  }
  if (boards.isError || !boards.data) {
    return (
      <MarketCenterError
        title="板块数据暂时无法读取"
        message={boards.error instanceof Error ? boards.error.message : "请稍后重试"}
        onRetry={() => void boards.refetch()}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg bg-app-surface p-0.5" role="group" aria-label="板块分类">
          {[
            ["industry", "行业板块"],
            ["concept", "概念板块"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`focus-ring rounded-md px-3 py-1.5 text-[11px] font-semibold ${
                type === value ? "bg-app-panel text-primary shadow-sm" : "text-app-muted"
              }`}
              aria-pressed={type === value}
              onClick={() =>
                void navigate({
                  to: "/home/market/boards",
                  search: { type: value as "industry" | "concept", window: rotationWindow },
                  replace: true,
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Text type="supporting" as="p" className="text-[11px]">
            当前排行 · 热力图 · 轮动 · 异动同屏
          </Text>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.72fr)]">
        <Card className="overflow-hidden rounded-2xl">
          <div className="flex items-start justify-between border-b border-app-line px-4 py-3">
            <div>
              <Heading level={2} className="text-sm">
                {type === "industry" ? "行业板块排行" : "概念板块排行"}
              </Heading>
              <Text type="supporting" as="p" className="mt-1 text-[11px]">
                涨跌幅、主力净流入与领涨股
              </Text>
            </div>
          </div>
          <MarketBoardRanking
            key={type}
            title={type === "industry" ? "行业板块" : "概念板块"}
            rows={boards.data}
            rotationRows={rotation.data?.rows ?? []}
            onOpen={openBoard}
          />
        </Card>
        <Card className="flex flex-col overflow-hidden rounded-2xl">
          <div className="flex items-start justify-between border-b border-app-line px-4 py-3">
            <div>
              <Heading level={2} className="text-sm">板块热力图</Heading>
              <Text type="supporting" as="p" className="mt-1 text-[11px]">
                市值前 {MARKET_CAP_HEATMAP_LIMIT} · 面积按总市值 · 颜色按涨跌幅分档
              </Text>
            </div>
            <span className="rounded-full bg-app-surface px-2.5 py-1.5 font-mono text-[10px] text-app-muted">
              {MARKET_CAP_HEATMAP_LIMIT} 板块
            </span>
          </div>
          {boards.data.length ? (
            <BoardHeatmap items={boards.data} onOpen={openBoard} />
          ) : (
            <p className="py-16 text-center text-xs text-app-muted">热力图暂无数据</p>
          )}
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.72fr)]">
        <Card className="overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-app-line px-4 py-3">
            <div>
              <Heading level={2} className="text-sm">
                {type === "industry" ? "行业轮动" : "概念轮动"}
              </Heading>
              <Text type="supporting" as="p" className="mt-1 text-[11px]">
                相对强弱、排名变化与主力确认
              </Text>
            </div>
            <div className="flex rounded-lg bg-app-surface p-0.5" role="group" aria-label="轮动窗口">
              {[
                ["5D", "5 日"],
                ["20D", "20 日"],
                ["60D", "60 日"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`focus-ring rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                    rotationWindow === value
                      ? "bg-app-panel text-primary shadow-sm"
                      : "text-app-muted"
                  }`}
                  aria-pressed={rotationWindow === value}
                  onClick={() =>
                    void navigate({
                      to: "/home/market/boards",
                      search: { type, window: value as RotationWindow },
                      replace: true,
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {rotation.data ? (
            <MarketBoardRotation
              key={`${type}-${rotationWindow}`}
              type={type}
              data={rotation.data}
              onOpen={openBoard}
            />
          ) : rotation.isError ? (
            <p className="py-14 text-center text-xs text-destructive">轮动数据读取失败</p>
          ) : (
            <div className="h-64 animate-pulse bg-app-surface" />
          )}
        </Card>
        <Card className="overflow-hidden rounded-2xl">
          <div className="flex items-start justify-between border-b border-app-line px-4 py-3">
            <div>
              <Heading level={2} className="text-sm">
                {type === "industry" ? "行业异动" : "概念异动"}
              </Heading>
              <Text type="supporting" as="p" className="mt-1 text-[11px]">
                规则命中、证据时间与详情下钻
              </Text>
            </div>
          </div>
          {rotation.data ? (
            <MarketBoardAnomaly data={rotation.data} onOpen={openBoard} />
          ) : (
            <p className="py-14 text-center text-xs text-app-muted">异动数据暂不可用</p>
          )}
        </Card>
      </div>
    </div>
  );
}
