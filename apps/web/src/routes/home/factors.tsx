import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Code } from "@astryxdesign/core/Code";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { Table, proportional } from "@astryxdesign/core/Table";
import { FactorCreateDialog } from "../../components/FactorCreateDialog";
import { FactorEditDialog } from "../../components/FactorEditDialog";
import { FactorExpressionReference } from "../../components/FactorExpressionReference";
import { FactorCodeReference } from "../../components/FactorCodeReference";
import { AKQUANT_FACTOR_EXPRESSIONS } from "../../lib/akquantFactors";
import { authClient } from "../../lib/auth-client";
import {
  useFactorsQuery,
  useCreateFactor,
  useUpdateFactor,
  FACTOR_CATEGORY_LABELS,
  FACTOR_KIND_LABELS,
  normalizeFactorKind,
  type Factor,
  type FactorKind,
} from "../../hooks/useFactors";

type FactorRow = Record<string, unknown> & {
  name: string;
  label: string;
  category: string;
  kind: FactorKind;
  expression: string;
  code: string;
  creator: string;
  createdBy: string;
  isPublic: boolean;
};

/** 取 Python 代码的首个非空行作为列表摘要 */
function firstCodeLine(code: string): string {
  return code.split("\n").find((line) => line.trim())?.trim() ?? "";
}

function makeColumns(onOpenEdit: (row: FactorRow) => void) {
  return [
    {
      key: "label",
      header: "名称",
      width: proportional(1),
      renderCell: (row: FactorRow) => (
        <Text
          style={{ color: "var(--color-text-blue)", cursor: "pointer" }}
          onClick={() => onOpenEdit(row)}
        >
          {row.label}
        </Text>
      ),
    },
    {
      key: "kind",
      header: "方式",
      width: proportional(1),
      renderCell: (row: FactorRow) => <Badge label={FACTOR_KIND_LABELS[row.kind]} />,
    },
    {
      key: "definition",
      header: "定义",
      width: proportional(3),
      renderCell: (row: FactorRow) => {
        if (row.kind === "python") {
          const summary = firstCodeLine(row.code);
          return summary ? (
            <Code>{summary}</Code>
          ) : (
            <Text type="supporting">Python 代码</Text>
          );
        }
        return row.expression ? (
          <Code>{row.expression}</Code>
        ) : (
          <Text type="supporting">—</Text>
        );
      },
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
        <Badge
          label={row.isPublic ? "公开" : "私有"}
          variant={row.isPublic ? "success" : "neutral"}
        />
      ),
    },
  ];
}

export const Route = createFileRoute("/home/factors")({
  component: FactorsPage,
});

function FactorsPage() {
  const { data: factors = [], isLoading } = useFactorsQuery();
  const createFactor = useCreateFactor();
  const updateFactor = useUpdateFactor();
  const userId = authClient.useSession().data?.user.id;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingFactor, setEditingFactor] = useState<Factor | null>(null);

  const rows: FactorRow[] = useMemo(
    () =>
      factors.map((f) => ({
        name: f.name,
        label: f.label,
        category: f.category,
        kind: normalizeFactorKind(f.kind),
        expression: f.expression ?? AKQUANT_FACTOR_EXPRESSIONS[f.name] ?? "",
        code: f.code ?? "",
        creator: f.creator,
        createdBy: f.createdBy,
        isPublic: f.isPublic,
      })),
    [factors],
  );

  const columns = useMemo(
    () =>
      makeColumns((row) => {
        const f = factors.find((x) => x.name === row.name);
        if (f) setEditingFactor(f);
      }),
    [factors],
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
          <HoverCard
            content={<FactorCodeReference />}
            placement="below"
            alignment="start"
            hasHoverIndication
          >
            <Text size="sm" type="supporting">
              Python 因子说明
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
        onOpenChange={(open) => !open && setEditingFactor(null)}
        canEdit={editingFactor?.createdBy === userId}
        onSubmit={(input) => updateFactor.mutate(input)}
      />
    </VStack>
  );
}
