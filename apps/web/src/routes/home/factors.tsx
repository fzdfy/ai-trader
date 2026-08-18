import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Code } from "@astryxdesign/core/Code";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { Table, proportional } from "@astryxdesign/core/Table";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { Pencil, Trash2 } from "lucide-react";
import { FactorCreateDialog } from "../../components/FactorCreateDialog";
import { FactorEditDialog } from "../../components/FactorEditDialog";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog";
import { FactorExpressionReference } from "../../components/FactorExpressionReference";
import { AKQUANT_FACTOR_EXPRESSIONS } from "../../lib/akquantFactors";
import { authClient } from "../../lib/auth-client";
import {
  useFactorsQuery,
  useCreateFactor,
  useUpdateFactor,
  useDeleteFactor,
  FACTOR_CATEGORY_LABELS,
} from "../../hooks/useFactors";

type FactorRow = Record<string, unknown> & {
  name: string;
  label: string;
  category: string;
  expression: string;
  creator: string;
  createdBy: string;
  isPublic: boolean;
};

const FACTOR_COLUMNS = [
  {
    key: "label",
    header: "名称",
    width: proportional(1),
    renderCell: (row: FactorRow) => (
      <Link
        to="/home/factors/$factorName"
        params={{ factorName: row.name }}
        style={{ textDecoration: "none" }}
      >
        <Text style={{ color: "var(--color-text-accent)" }}>{row.label}</Text>
      </Link>
    ),
  },
  {
    key: "expression",
    header: "表达式",
    width: proportional(3),
    renderCell: (row: FactorRow) =>
      row.expression ? <Code>{row.expression}</Code> : <Text type="supporting">—</Text>,
  },
  {
    key: "category",
    header: "分类",
    width: proportional(1),
    renderCell: (row: FactorRow) => (
      <Badge label={FACTOR_CATEGORY_LABELS[row.category] ?? row.category} />
    ),
  },
  { key: "creator", header: "创建者", width: proportional(1) },
  {
    key: "isPublic",
    header: "公开",
    width: proportional(1),
    renderCell: (row: FactorRow) => (
      <Badge label={row.isPublic ? "公开" : "私有"} variant={row.isPublic ? "success" : "neutral"} />
    ),
  },
];

export const Route = createFileRoute("/home/factors")({
  component: FactorsPage,
});

function FactorsPage() {
  const { data: factors = [], isLoading } = useFactorsQuery();
  const createFactor = useCreateFactor();
  const updateFactor = useUpdateFactor();
  const deleteFactor = useDeleteFactor();
  const userId = authClient.useSession().data?.user.id;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingFactorName, setEditingFactorName] = useState<string | null>(null);
  const [deletingFactorName, setDeletingFactorName] = useState<string | null>(null);

  const editingFactor = useMemo(
    () => factors.find((f) => f.name === editingFactorName) ?? null,
    [factors, editingFactorName],
  );
  const deletingFactor = useMemo(
    () => factors.find((f) => f.name === deletingFactorName) ?? null,
    [factors, deletingFactorName],
  );

  const rows: FactorRow[] = useMemo(
    () =>
      factors.map((f) => ({
        name: f.name,
        label: f.label,
        category: f.category,
        expression: f.expression ?? AKQUANT_FACTOR_EXPRESSIONS[f.name] ?? "",
        creator: f.creator,
        createdBy: f.createdBy,
        isPublic: f.isPublic,
      })),
    [factors],
  );

  // 操作列：仅对当前用户创建的因子展示编辑/删除
  const columns = useMemo(
    () => [
      ...FACTOR_COLUMNS,
      {
        key: "actions",
        header: "操作",
        width: proportional(1),
        renderCell: (row: FactorRow) =>
          row.createdBy === userId ? (
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
                { label: "编辑", icon: Pencil, onClick: () => setEditingFactorName(row.name) },
                { label: "删除", icon: Trash2, onClick: () => setDeletingFactorName(row.name) },
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
        <HStack gap={3} align="center">
          <Heading level={2}>因子</Heading>
          <HoverCard
            content={<FactorExpressionReference />}
            placement="below"
            alignment="start"
            hasHoverIndication
          >
            <Text size="sm" type="supporting">
              全部因子表达式
            </Text>
          </HoverCard>
        </HStack>
        <Button label="创建因子" variant="primary" onClick={() => setIsCreateOpen(true)} />
      </HStack>

      {isLoading ? (
        <Spinner size="sm" label="加载中..." />
      ) : factors.length === 0 ? (
        <Text type="supporting">暂无因子</Text>
      ) : (
        <Table<FactorRow>
          idKey="name"
          columns={columns}
          data={rows}
          density="balanced"
          dividers="rows"
          hasHover
          textOverflow="truncate"
        />
      )}

      <FactorCreateDialog
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={(input) => createFactor.mutate(input)}
      />

      <FactorEditDialog
        factor={editingFactor}
        isOpen={editingFactor != null}
        onOpenChange={(open) => !open && setEditingFactorName(null)}
        onSubmit={(input) => updateFactor.mutate(input)}
      />

      <ConfirmDeleteDialog
        isOpen={deletingFactor != null}
        title="删除因子"
        message={deletingFactor ? `确认删除因子「${deletingFactor.label}」？` : undefined}
        isLoading={deleteFactor.isPending}
        onOpenChange={(open) => !open && setDeletingFactorName(null)}
        onConfirm={() => {
          if (deletingFactor) {
            deleteFactor.mutate(deletingFactor.name, {
              onSuccess: () => setDeletingFactorName(null),
            });
          }
        }}
      />
    </VStack>
  );
}
