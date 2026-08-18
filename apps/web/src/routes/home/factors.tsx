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
import { FactorCreateDialog } from "../../components/FactorCreateDialog";
import { FactorExpressionReference } from "../../components/FactorExpressionReference";
import { AKQUANT_FACTOR_EXPRESSIONS } from "../../lib/akquantFactors";
import { useFactorsQuery, useCreateFactor, FACTOR_CATEGORY_LABELS } from "../../hooks/useFactors";

type FactorRow = Record<string, unknown> & {
  name: string;
  label: string;
  category: string;
  expression: string;
  creator: string;
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
];

export const Route = createFileRoute("/home/factors")({
  component: FactorsPage,
});

function FactorsPage() {
  const { data: factors = [], isLoading } = useFactorsQuery();
  const createFactor = useCreateFactor();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const rows: FactorRow[] = useMemo(
    () =>
      factors.map((f) => ({
        name: f.name,
        label: f.label,
        category: f.category,
        expression: AKQUANT_FACTOR_EXPRESSIONS[f.name] ?? "",
        creator: f.creator,
      })),
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
          columns={FACTOR_COLUMNS}
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
    </VStack>
  );
}
