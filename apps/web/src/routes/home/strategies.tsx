import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, proportional } from "@astryxdesign/core/Table";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { Pencil, Trash2 } from "lucide-react";
import { StrategyCreateDialog } from "../../components/StrategyCreateDialog";
import { StrategyEditDialog } from "../../components/StrategyEditDialog";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog";
import {
  useStrategiesQuery,
  useCreateStrategy,
  useUpdateStrategy,
  useDeleteStrategy,
} from "../../hooks/useStrategies";
import { useFactorsQuery } from "../../hooks/useFactors";
import { authClient } from "../../lib/auth-client";

type StrategyRow = Record<string, unknown> & {
  id: number;
  name: string;
  description: string;
  isSystem: boolean;
  isPublic: boolean;
  creator: string;
  userId: string;
};

const STRATEGY_COLUMNS = [
  {
    key: "name",
    header: "名称",
    width: proportional(2),
    renderCell: (row: StrategyRow) => (
      <Link
        to="/home/strategies/$strategyId"
        params={{ strategyId: String(row.id) }}
        style={{ textDecoration: "none" }}
      >
        <Text style={{ color: "var(--color-text-accent)" }}>{row.name}</Text>
      </Link>
    ),
  },
  { key: "description", header: "描述", width: proportional(3) },
  {
    key: "isSystem",
    header: "类型",
    width: proportional(1),
    renderCell: (row: StrategyRow) => <Badge label={row.isSystem ? "系统" : "自定义"} />,
  },
  { key: "creator", header: "创建者", width: proportional(1) },
  {
    key: "isPublic",
    header: "公开",
    width: proportional(1),
    renderCell: (row: StrategyRow) => (
      <Badge label={row.isPublic ? "公开" : "私有"} variant={row.isPublic ? "success" : "neutral"} />
    ),
  },
];

export const Route = createFileRoute("/home/strategies")({
  component: StrategiesPage,
});

function StrategiesPage() {
  const { data: strategies = [], isLoading } = useStrategiesQuery();
  const { data: factors = [] } = useFactorsQuery();
  const createStrategy = useCreateStrategy();
  const updateStrategy = useUpdateStrategy();
  const deleteStrategy = useDeleteStrategy();
  const userId = authClient.useSession().data?.user.id;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingStrategyId, setEditingStrategyId] = useState<number | null>(null);
  const [deletingStrategyId, setDeletingStrategyId] = useState<number | null>(null);

  const editingStrategy = useMemo(
    () => strategies.find((s) => s.id === editingStrategyId) ?? null,
    [strategies, editingStrategyId],
  );
  const deletingStrategy = useMemo(
    () => strategies.find((s) => s.id === deletingStrategyId) ?? null,
    [strategies, deletingStrategyId],
  );

  const rows: StrategyRow[] = useMemo(
    () =>
      strategies.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? "",
        isSystem: s.isSystem,
        isPublic: s.isPublic,
        creator: s.creator,
        userId: s.userId,
      })),
    [strategies],
  );

  // 操作列：仅对当前用户创建的策略展示编辑/删除（系统策略不可编辑删除）
  const columns = useMemo(
    () => [
      ...STRATEGY_COLUMNS,
      {
        key: "actions",
        header: "操作",
        width: proportional(1),
        renderCell: (row: StrategyRow) =>
          row.userId === userId ? (
            <DropdownMenu
              button={{
                label: "操作",
                icon: <Icon icon="moreHorizontal" />,
                variant: "ghost",
                size: "sm",
                isIconOnly: true,
              }}
              hasChevron={false}
              items={[
                { label: "编辑", icon: Pencil, onClick: () => setEditingStrategyId(row.id) },
                { label: "删除", icon: Trash2, onClick: () => setDeletingStrategyId(row.id) },
              ]}
            />
          ) : null,
      },
    ],
    [userId],
  );

  return (
    <VStack gap={4}>
      <HStack gap={3} align="center" style={{ justifyContent: "space-between" }}>
        <Heading level={2}>策略</Heading>
        <Button label="创建策略" variant="primary" onClick={() => setIsCreateOpen(true)} />
      </HStack>

      {isLoading ? (
        <Spinner size="sm" label="加载中..." />
      ) : strategies.length === 0 ? (
        <Text type="supporting">暂无策略</Text>
      ) : (
        <Table<StrategyRow>
          idKey="id"
          columns={columns}
          data={rows}
          density="balanced"
          dividers="rows"
          hasHover
          textOverflow="truncate"
        />
      )}

      <StrategyCreateDialog
        isOpen={isCreateOpen}
        factors={factors}
        onOpenChange={setIsCreateOpen}
        onSubmit={(input) => createStrategy.mutate(input)}
      />

      <StrategyEditDialog
        strategy={editingStrategy}
        factors={factors}
        isOpen={editingStrategy != null}
        onOpenChange={(open) => !open && setEditingStrategyId(null)}
        onSubmit={(input) => updateStrategy.mutate(input)}
      />

      <ConfirmDeleteDialog
        isOpen={deletingStrategy != null}
        title="删除策略"
        message={deletingStrategy ? `确认删除策略「${deletingStrategy.name}」？` : undefined}
        isLoading={deleteStrategy.isPending}
        onOpenChange={(open) => !open && setDeletingStrategyId(null)}
        onConfirm={() => {
          if (deletingStrategy) {
            deleteStrategy.mutate(deletingStrategy.id, {
              onSuccess: () => setDeletingStrategyId(null),
            });
          }
        }}
      />
    </VStack>
  );
}
