import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Spinner } from "@astryxdesign/core/Spinner";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { StocksTab } from "../-private/StocksTab";
import { useWatchlistInstrumentsQuery, useRemoveWatchlist } from "../../../../hooks/useInstruments";
import type { Instrument } from "../../../../hooks/useInstruments";
import { MinusIcon } from "lucide-react";

export const Route = createFileRoute("/home/market/stock/")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: (search.tab as string) ?? "stock",
  }),
  component: StocksPage,
});

function StocksPage() {
  const { tab } = Route.useSearch();
  const [activeTab, setActiveTab] = useState(tab ?? "stock");
  const navigate = Route.useNavigate();

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    navigate({ search: { tab: value }, replace: true });
  };

  return (
    <VStack gap={4}>
      <Heading level={2}>个股</Heading>
      <TabList value={activeTab} onChange={handleTabChange}>
        <Tab value="stock" label="个股" />
        <Tab value="watchlist" label="自选" />
      </TabList>
      {activeTab === "stock" && <StocksTab />}
      {activeTab === "watchlist" && <WatchlistContent />}
    </VStack>
  );
}

/** 自选 Tab 内容 */
function WatchlistContent() {
  const { data: instruments = [], isFetching } = useWatchlistInstrumentsQuery();
  const removeWatchlist = useRemoveWatchlist();

  const columns = [
    { key: "symbol" as const, header: "代码", width: proportional(1) },
    {
      key: "name" as const,
      header: "名称",
      width: proportional(2),
      renderCell: (row: Instrument) => (
        <Link
          to="/home/market/stock/$symbol"
          params={{ symbol: row.symbol }}
          style={{ textDecoration: "none" }}
        >
          <Text style={{ color: "var(--color-text-accent)" }}>{row.name}</Text>
        </Link>
      ),
    },
    { key: "exchange" as const, header: "交易所", width: proportional(1) },
    {
      key: "action" as const,
      header: "操作",
      width: proportional(0.5),
      renderCell: (row: Instrument) => (
        <IconButton
          icon={<MinusIcon />}
          label="取消自选"
          size="sm"
          variant="ghost"
          onClick={() => removeWatchlist.mutate(row.symbol)}
        />
      ),
    },
  ];

  if (isFetching) {
    return (
      <VStack gap={4} align="center">
        <Spinner size="sm" label="加载中..." />
      </VStack>
    );
  }

  if (instruments.length === 0) {
    return (
      <VStack gap={4} align="center">
        <Text type="supporting">暂无自选股票，去板块页面添加</Text>
      </VStack>
    );
  }

  return (
    <Table<Instrument>
      idKey="symbol"
      columns={columns}
      data={instruments}
      density="compact"
      dividers="rows"
      hasHover
    />
  );
}
