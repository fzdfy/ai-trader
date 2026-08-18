import { useState } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Card } from "@astryxdesign/core/Card";
import { Switch } from "@astryxdesign/core/Switch";
import { authClient } from "../../../lib/auth-client";
import {
  useFactorQuery,
  useUpdateFactorVisibility,
  useUpdateFactor,
  FACTOR_CATEGORY_LABELS,
} from "../../../hooks/useFactors";
import { FactorEditDialog } from "../../../components/FactorEditDialog";

export const Route = createFileRoute("/home/factors/$factorName")({
  component: FactorDetailPage,
});

function FactorDetailPage() {
  const { factorName } = useParams({ from: "/home/factors/$factorName" });
  const { data: factor, isLoading } = useFactorQuery(factorName);
  const updateVisibility = useUpdateFactorVisibility();
  const updateFactor = useUpdateFactor();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const userId = authClient.useSession().data?.user.id;

  if (isLoading) {
    return <Spinner size="sm" label="加载中..." />;
  }

  if (!factor) {
    return <Text type="supporting">因子不存在</Text>;
  }

  // 仅创建者本人可修改公开状态
  const canEdit = factor.createdBy === userId;

  return (
    <VStack gap={4}>
      <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
        <Link to="/home/factors" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
        {canEdit ? (
          <Button label="编辑" variant="primary" size="sm" onClick={() => setIsEditOpen(true)} />
        ) : null}
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

      <Card padding={5}>
        <Switch
          label="公开"
          description={canEdit ? "开启后其他用户也能看到该因子" : "仅创建者可修改公开状态"}
          value={factor.isPublic}
          isDisabled={!canEdit}
          isLoading={updateVisibility.isPending}
          onChange={(checked) => updateVisibility.mutate({ name: factor.name, isPublic: checked })}
        />
      </Card>

      <FactorEditDialog
        factor={factor}
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSubmit={(input) => updateFactor.mutate(input)}
      />
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
