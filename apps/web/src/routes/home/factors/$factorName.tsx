import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Card } from "@astryxdesign/core/Card";
import { useFactorQuery, FACTOR_CATEGORY_LABELS } from "../../../hooks/useFactors";

export const Route = createFileRoute("/home/factors/$factorName")({
  component: FactorDetailPage,
});

function FactorDetailPage() {
  const { factorName } = useParams({ from: "/home/factors/$factorName" });
  const { data: factor, isLoading } = useFactorQuery(factorName);

  if (isLoading) {
    return <Spinner size="sm" label="加载中..." />;
  }

  if (!factor) {
    return <Text type="supporting">因子不存在</Text>;
  }

  return (
    <VStack gap={4}>
      <HStack gap={2} align="center">
        <Link to="/home/factors" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
      </HStack>

      <VStack gap={1}>
        <Heading level={2}>{factor.label}</Heading>
        <Text type="supporting" size="sm">
          {factor.name}
        </Text>
      </VStack>

      <Card padding={5}>
        <VStack gap={4}>
          <InfoRow label="分类" value={FACTOR_CATEGORY_LABELS[factor.category] ?? factor.category} />
          <InfoRow label="方向" value={factor.direction === 1 ? "正向" : "反向"} />
          <InfoRow label="描述" value={factor.description ?? "-"} />
        </VStack>
      </Card>
    </VStack>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack gap={4} align="start">
      <Text type="supporting" style={{ width: 80, flexShrink: 0 }}>
        {label}
      </Text>
      <Text style={{ flex: 1 }}>{value}</Text>
    </HStack>
  );
}
