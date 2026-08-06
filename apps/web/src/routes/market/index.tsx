import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { BoardsTab } from "./-private/BoardsTab";
import { StocksTab } from "./-private/StocksTab";
import { ChipsTab } from "./-private/ChipsTab";
import { FundFlowTab } from "./-private/FundFlowTab";
import { HeatmapTab } from "./-private/HeatmapTab";

export const Route = createFileRoute("/market/")({
  component: MarketPage,
});

type MarketTab = "boards" | "stocks" | "chips" | "fundflow" | "heatmap";

function MarketPage() {
  const [tab, setTab] = useState<MarketTab>("boards");

  return (
    <VStack gap={5}>
      <Heading level={2}>行情</Heading>
      <TabList value={tab} onChange={(v) => setTab(v as MarketTab)}>
        <Tab value="boards" label="板块" />
        <Tab value="stocks" label="个股" />
        <Tab value="chips" label="筹码分布" />
        <Tab value="fundflow" label="资金流向" />
        <Tab value="heatmap" label="热力图" />
      </TabList>

      {tab === "boards" && <BoardsTab />}
      {tab === "stocks" && <StocksTab />}
      {tab === "chips" && <ChipsTab />}
      {tab === "fundflow" && <FundFlowTab />}
      {tab === "heatmap" && <HeatmapTab />}
    </VStack>
  );
}
