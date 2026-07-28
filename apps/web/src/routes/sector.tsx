import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Spinner } from "@astryxdesign/core/Spinner";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Section } from "@astryxdesign/core/Section";
import {
  useInstrumentsQuery,
  useWatchlistQuery,
  useAddWatchlist,
  useRemoveWatchlist,
} from "../hooks/useInstruments";
import type { Instrument } from "../hooks/useInstruments";
import { MinusIcon, PlusIcon } from "lucide-react";

export const Route = createFileRoute("/sector")({
  component: SectorPage,
});

function getStockColumns(
  watchlist: string[],
  onAdd: (s: string) => void,
  onRemove: (s: string) => void,
) {
  return [
    { key: "symbol" as const, header: "代码", width: proportional(1) },
    { key: "name" as const, header: "名称", width: proportional(1.5) },
    { key: "exchange" as const, header: "交易所", width: proportional(0.8) },
    {
      key: "action" as const,
      header: "操作",
      width: proportional(0.5),
      renderCell: (row: Instrument) => {
        const isWatched = watchlist.includes(row.symbol);
        return isWatched ? (
          <IconButton
            icon={<MinusIcon />}
            label="取消自选"
            size="sm"
            variant="ghost"
            onClick={() => onRemove(row.symbol)}
          />
        ) : (
          <IconButton
            icon={<PlusIcon />}
            label="添加自选"
            size="sm"
            variant="ghost"
            onClick={() => onAdd(row.symbol)}
          />
        );
      },
    },
  ];
}

function SectorPage() {
  const [inputValue, setInputValue] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const {
    data: instrumentsData,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInstrumentsQuery(searchQ);
  const { data: watchlist = [] } = useWatchlistQuery();
  const addWatchlist = useAddWatchlist();
  const removeWatchlist = useRemoveWatchlist();

  const allInstruments = instrumentsData?.pages.flatMap((p) => p.data) ?? [];

  const handleSearch = useCallback(() => {
    setSearchQ(inputValue);
  }, [inputValue]);

  return (
    <VStack gap={6}>
      <Section>
        <HStack gap={2}>
          <TextInput
            label="搜索股票"
            isLabelHidden
            placeholder="输入代码或名称搜索..."
            value={inputValue}
            onChange={setInputValue}
            startIcon="search"
          />
          <Button label="搜索" variant="primary" onClick={handleSearch} />
        </HStack>
        <Table<Instrument>
          idKey="symbol"
          columns={getStockColumns(watchlist, addWatchlist.mutate, removeWatchlist.mutate)}
          data={allInstruments}
          density="compact"
          dividers="rows"
          hasHover
        />
        {hasNextPage && (
          <div style={{ padding: "var(--spacing-2)", textAlign: "center" }}>
            <Button
              label={isFetchingNextPage ? "加载中..." : "加载更多"}
              variant="ghost"
              onClick={() => fetchNextPage()}
              isDisabled={isFetchingNextPage}
            />
          </div>
        )}
        {isFetching && !isFetchingNextPage && <Spinner size="sm" label="加载中..." />}
      </Section>
    </VStack>
  );
}
