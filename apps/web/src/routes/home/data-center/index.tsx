import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { DataTableList } from "../-private/DataTableList";

export const Route = createFileRoute("/home/data-center/")({
  component: DataCenterPage,
});

function DataCenterPage() {
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2}>数据中心</Heading>
        <Text type="supporting">股票数据相关表总览，点击卡片查看表结构与更新记录</Text>
      </VStack>
      <DataTableList />
    </VStack>
  );
}
