import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Card } from "@astryxdesign/core/Card";
import { HeatmapChart, type HeatmapItem } from "../../../components/charts/HeatmapChart";
import { useHeatmapQuery, useHeatmapBoardQuery } from "../../../hooks/useHeatmap";
import { toSymbol } from "../../../lib/format";

/** Tab 5: 热力图（行业 / 概念）
 *
 * 两级下钻（用 level 标识决定点击行为，不做位置搜索）：
 *   1. 板块层（level="board"）→ 点击板块任意位置 → 下钻该板块成分股热力图
 *   2. 成分股层（level="stock"）→ 点击成分股 → 跳转个股详情
 */
export function HeatmapTab() {
  const navigate = useNavigate();
  const [heatType, setHeatType] = useState<"industry" | "concept">("industry");
  const { data = [], isFetching } = useHeatmapQuery(heatType);
  const loading = isFetching;
  // 下钻目标板块：null = 板块层；非空 = 该板块成分股热力图
  const [drillBoard, setDrillBoard] = useState<HeatmapItem | null>(null);

  // 切换行业/概念时回到板块层
  useEffect(() => {
    setDrillBoard(null);
  }, [heatType]);

  // 下钻数据：优先复用上层 children（板块接口已带成分股缓存）；
  // children 为空时查询数据库/实时拉取（仅此时发请求）
  const boardCode = drillBoard?.code ?? "";
  const drillChildren = drillBoard?.children ?? [];
  const { data: boardStocks = [], isFetching: boardLoading } = useHeatmapBoardQuery(
    heatType,
    boardCode,
    drillChildren.length === 0,
  );
  const constituents: HeatmapItem[] = drillChildren.length > 0 ? drillChildren : boardStocks;

  // 点击成分股格子 → 跳转个股详情页
  const handleStockClick = (item: HeatmapItem) => {
    const symbol = toSymbol(item.code);
    navigate({ to: "/stock/$symbol", params: { symbol } });
  };

  return (
    <VStack gap={3}>
      <HStack gap={3} align="center">
        <TabList value={heatType} onChange={(v) => setHeatType(v as "industry" | "concept")}>
          <Tab value="industry" label="行业热力图" />
          <Tab value="concept" label="概念热力图" />
        </TabList>
        {loading && <Spinner size="sm" label="加载中..." />}
      </HStack>

      {drillBoard ? (
        <>
          <HStack gap={3} align="center">
            <Button label="← 返回全部板块" variant="ghost" onClick={() => setDrillBoard(null)} />
            <Text type="supporting" size="sm">
              当前板块：{drillBoard.name}（{drillBoard.code}）· 成分股 {constituents.length} 只 · 点击成分股查看个股详情
            </Text>
          </HStack>
          {constituents.length > 0 ? (
            <Card padding={4}>
              <HeatmapChart data={constituents} level="stock" onStockClick={handleStockClick} />
            </Card>
          ) : boardLoading ? (
            <Spinner size="sm" label="加载成分股中..." />
          ) : (
            <Text type="supporting">该板块暂无成分股数据（数据库无缓存，上游数据源暂不可达）</Text>
          )}
        </>
      ) : data.length > 0 ? (
        <Card padding={4}>
          <HeatmapChart data={data} level="board" onBoardClick={setDrillBoard} />
        </Card>
      ) : (
        !loading && <Text type="supporting">暂无热力图数据（上游接口可能暂不可达）</Text>
      )}

      <Text type="supporting" size="sm">
        热力图颜色按涨跌幅（红涨绿跌）：一级 = 行业/概念板块（面积=总市值），板块内嵌显示成分股（面积=成交额）；点击板块格子（任意位置）下钻查看该板块成分股热力图，再点击成分股可进入个股详情。默认展示涨幅榜前 200 个板块。A 股无官方 GICS 分类，按东财行业/概念分类呈现（GICS 风格热力图）。
      </Text>
    </VStack>
  );
}
