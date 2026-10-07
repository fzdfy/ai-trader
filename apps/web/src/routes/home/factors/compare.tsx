import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Icon } from "@astryxdesign/core/Icon";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Section } from "@astryxdesign/core/Section";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import {
  Table,
  proportional,
  useTableSelection,
  useTableSortable,
  useTableSortableState,
} from "@astryxdesign/core/Table";
import {
  FactorDecayChart,
  type FactorDecaySeries,
} from "../../../components/charts/FactorDecayChart";
import { summarizeDecay, formatHalfLife } from "../../../lib/factorDecay";
import { useFactorsQuery, useFactorEvaluationsQuery } from "../../../hooks/useFactors";

/**
 * 跨因子「衰退对比」页。
 * 通过 names 查询参数（逗号分隔）接收预选中的因子，未指定时默认取 |IC| 最高的前 3 个。
 */
export const Route = createFileRoute("/home/factors/compare")({
  validateSearch: (search: Record<string, unknown>): { names?: string } => {
    const raw = search.names;
    return typeof raw === "string" && raw ? { names: raw } : {};
  },
  component: FactorComparePage,
});

type CompareRow = Record<string, unknown> & {
  factorName: string;
  label: string;
  /** 半衰期（日）；始终未衰减至一半时为 null */
  halfLife: number | null;
  /** 末期 IC 保留率 */
  retention: number | null;
  /** 是否至少有一个有效衰退点 */
  hasData: boolean;
  /** 覆盖的最大持有期 */
  maxHorizon: number | null;
  icMean: number | null;
  rankIcMean: number | null;
  icir: number | null;
  tStat: number | null;
  longShortAnnRet: number | null;
};

/** 数值格式化：null / 非有限值显示占位符 */
const formatNum = (value: number | null | undefined, digits = 3): string =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

/** 缺值排序：null 一律排在最后 */
const compareNullable = (a: number | null, b: number | null): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
};

function MetricCell({
  value,
  digits = 3,
  isPercent = false,
  isColored = false,
}: {
  value: number | null | undefined;
  digits?: number;
  isPercent?: boolean;
  isColored?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) return <Text type="supporting">—</Text>;
  const text = isPercent ? `${(value * 100).toFixed(1)}%` : value.toFixed(digits);
  if (!isColored) return <Text style={{ fontWeight: 600 }}>{text}</Text>;
  let color: string | undefined;
  if (value > 0) color = "var(--color-text-positive)";
  else if (value < 0) color = "var(--color-text-negative)";
  return <Text style={{ color, fontWeight: 600 }}>{text}</Text>;
}

/** 按末期保留率粗判信号耐久度 */
function decayBadge(row: CompareRow) {
  if (!row.hasData || row.retention == null) return <Badge label="—" variant="neutral" />;
  if (row.retention >= 0.5) return <Badge label="耐用" variant="success" />;
  if (row.retention >= 0.3) return <Badge label="一般" variant="neutral" />;
  return <Badge label="短命" variant="warning" />;
}

/** 表头 + info 图标：悬停查看该列口径说明 */
function HintHeader({ label, hint }: { label: string; hint: string }) {
  return (
    <HStack gap={1} align="center">
      <Text type="label" size="sm">
        {label}
      </Text>
      <HoverCard
        content={
          <Text size="sm" style={{ maxWidth: 280 }}>
            {hint}
          </Text>
        }
        placement="below"
        alignment="start"
        hasHoverIndication
      >
        <Icon icon="info" size="xsm" color="secondary" />
      </HoverCard>
    </HStack>
  );
}

const COMPARE_COLUMNS = [
  { key: "label", header: "因子", width: proportional(2) },
  {
    key: "halfLife",
    header: (
      <HintHeader
        label="半衰期"
        hint="|IC| 衰减到首期一半所需的持有期（日），相邻持有期线性插值；越长越耐用"
      />
    ),
    width: proportional(1),
    renderCell: (row: CompareRow) => (
      <Text style={{ fontWeight: 600 }}>{formatHalfLife(row)}</Text>
    ),
  },
  {
    key: "retention",
    header: (
      <HintHeader
        label="保留率"
        hint="末期 |IC| ÷ 首期 |IC|（到最大持有期）；> 100% 表示预测力随持有期增强"
      />
    ),
    width: proportional(1),
    renderCell: (row: CompareRow) => <MetricCell value={row.retention} isPercent />,
  },
  {
    key: "icMean",
    header: (
      <HintHeader
        label="IC"
        hint="逐日截面 Pearson 相关系数（因子值 vs 未来 1 日收益）的均值"
      />
    ),
    width: proportional(1),
    renderCell: (row: CompareRow) => <MetricCell value={row.icMean} />,
  },
  {
    key: "rankIcMean",
    header: (
      <HintHeader label="RankIC" hint="逐日截面 Spearman 秩相关系数的均值（抗极值）" />
    ),
    width: proportional(1),
    renderCell: (row: CompareRow) => <MetricCell value={row.rankIcMean} />,
  },
  {
    key: "icir",
    header: (
      <HintHeader label="ICIR" hint="IC 均值 ÷ IC 标准差（日频、未年化），衡量 IC 的稳定性" />
    ),
    width: proportional(1),
    renderCell: (row: CompareRow) => <MetricCell value={row.icir} />,
  },
  {
    key: "tStat",
    header: <HintHeader label="t 值" hint="ICIR × √有效天数，检验 IC 是否显著异于 0" />,
    width: proportional(1),
    renderCell: (row: CompareRow) => <MetricCell value={row.tStat} digits={2} />,
  },
  {
    key: "longShortAnnRet",
    header: (
      <HintHeader label="多空年化" hint="按因子值分 5 层，做多最高层、做空最低层的日收益均值年化" />
    ),
    width: proportional(1),
    renderCell: (row: CompareRow) => (
      <MetricCell value={row.longShortAnnRet} isPercent isColored />
    ),
  },
  {
    key: "decay",
    header: (
      <HintHeader label="健康度" hint="按末期保留率粗判：≥ 50% 耐用 · ≥ 30% 一般 · < 30% 短命" />
    ),
    width: proportional(1),
    renderCell: (row: CompareRow) => decayBadge(row),
  },
];

function FactorComparePage() {
  const { names } = Route.useSearch();
  const { data: factors = [] } = useFactorsQuery();
  const { data: evaluations = [], isLoading } = useFactorEvaluationsQuery();

  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState<"ic" | "rankIc">("ic");
  const [selected, setSelected] = useState<string[]>(() =>
    names ? names.split(",").filter(Boolean) : [],
  );

  const labelByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const factor of factors) map.set(factor.name, factor.label);
    return map;
  }, [factors]);

  // 仅保留有衰退数据的因子，按 |IC| 降序（便于默认选中最强的前几个）
  const rows: CompareRow[] = useMemo(
    () =>
      evaluations
        .filter((item) => item.decay && item.decay.length > 0)
        .map((item) => {
          const summary = summarizeDecay(item.decay ?? []);
          return {
            factorName: item.factorName,
            label: labelByName.get(item.factorName) ?? item.factorName,
            halfLife: summary.halfLife,
            retention: summary.retention,
            hasData: summary.hasData,
            maxHorizon: summary.maxHorizon,
            icMean: item.icMean,
            rankIcMean: item.rankIcMean,
            icir: item.icir,
            tStat: item.tStat,
            longShortAnnRet: item.longShortAnnRet,
          };
        })
        .toSorted((a, b) => Math.abs(b.icMean ?? 0) - Math.abs(a.icMean ?? 0)),
    [evaluations, labelByName],
  );

  const rowByName = useMemo(() => {
    const map = new Map<string, CompareRow>();
    for (const row of rows) map.set(row.factorName, row);
    return map;
  }, [rows]);

  const decayByName = useMemo(() => {
    const map = new Map<string, FactorDecaySeries["points"]>();
    for (const item of evaluations) {
      if (!item.decay || item.decay.length === 0) continue;
      map.set(
        item.factorName,
        item.decay.map((point) => ({
          horizon: point.horizon,
          ic: point.icMean,
          rankIc: point.rankIcMean,
        })),
      );
    }
    return map;
  }, [evaluations]);

  // 首次数据到位时，若 URL 未预选则默认取 |IC| 最高的前 3 个（仅执行一次）
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (selected.length > 0) {
      seededRef.current = true;
      return;
    }
    if (rows.length === 0) return;
    seededRef.current = true;
    setSelected(rows.slice(0, Math.min(3, rows.length)).map((row) => row.factorName));
  }, [rows, selected.length]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const keyword = query.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      keyword
        ? rows.filter(
            (row) =>
              row.label.toLowerCase().includes(keyword) ||
              row.factorName.toLowerCase().includes(keyword),
          )
        : rows,
    [rows, keyword],
  );

  const { sortedData, sortConfig } = useTableSortableState<CompareRow>({
    data: filteredRows,
    comparators: {
      halfLife: (a, b) => compareNullable(a.halfLife, b.halfLife),
      retention: (a, b) => compareNullable(a.retention, b.retention),
      icMean: (a, b) => compareNullable(a.icMean, b.icMean),
      rankIcMean: (a, b) => compareNullable(a.rankIcMean, b.rankIcMean),
      icir: (a, b) => compareNullable(a.icir, b.icir),
      tStat: (a, b) => compareNullable(a.tStat, b.tStat),
      longShortAnnRet: (a, b) => compareNullable(a.longShortAnnRet, b.longShortAnnRet),
    },
  });
  const sortable = useTableSortable<CompareRow>(sortConfig);

  const selection = useTableSelection<CompareRow>({
    getIsItemSelected: (item) => selectedSet.has(item.factorName),
    onSelectItem: ({ item, isSelected }) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (isSelected) next.add(item.factorName);
        else next.delete(item.factorName);
        return [...next];
      });
    },
    onSelectAll: ({ isAllSelected }) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const row of sortedData) {
          if (isAllSelected) next.add(row.factorName);
          else next.delete(row.factorName);
        }
        return [...next];
      });
    },
    getIsAllSelected: () =>
      sortedData.length > 0 && sortedData.every((row) => selectedSet.has(row.factorName)),
    getIsIndeterminate: () => {
      const count = sortedData.reduce(
        (n, row) => n + (selectedSet.has(row.factorName) ? 1 : 0),
        0,
      );
      return count > 0 && count < sortedData.length;
    },
  });

  const plugins = useMemo(() => ({ selection, sort: sortable }), [selection, sortable]);

  // 图表曲线：按选中顺序（表格中的展示顺序），过滤掉无数据的因子
  const series: FactorDecaySeries[] = useMemo(
    () =>
      selected
        .map((name) => ({
          name: rowByName.get(name)?.label ?? name,
          points: decayByName.get(name) ?? [],
        }))
        .filter((item) => item.points.length > 0),
    [selected, rowByName, decayByName],
  );

  let content: ReactNode;
  if (isLoading) {
    content = <Spinner size="sm" label="加载中..." />;
  } else if (rows.length === 0) {
    content = (
      <Text type="supporting">
        暂无带衰退数据的因子。请先到因子列表页执行「批量检验」，完成后即可在此对比。
      </Text>
    );
  } else {
    content = (
      <VStack gap={4}>
        <Card padding={5}>
          <VStack gap={3}>
            <HStack gap={3} align="center" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <VStack gap={1}>
                <Text type="label">衰退曲线对比（{series.length} 个因子）</Text>
                <Text type="supporting" size="sm">
                  |IC| 随持有期下滑越快，说明信号越短命；曲线越高越平、保留率越高越耐用
                </Text>
              </VStack>
              <SegmentedControl
                value={metric}
                onChange={(value) => setMetric(value as "ic" | "rankIc")}
                label="指标"
                size="sm"
              >
                <SegmentedControlItem value="ic" label="|IC|" />
                <SegmentedControlItem value="rankIc" label="|RankIC|" />
              </SegmentedControl>
            </HStack>
            {series.length > 0 ? (
              <FactorDecayChart factors={series} metric={metric} />
            ) : (
              <Text type="supporting" size="sm">
                请在下表勾选要对比的因子。
              </Text>
            )}
          </VStack>
        </Card>

        <Section>
          <VStack gap={3}>
            <HStack gap={3} align="center" style={{ flexWrap: "wrap" }}>
              <TextInput
                label="搜索"
                isLabelHidden
                placeholder="搜索因子名称"
                startIcon="search"
                value={query}
                onChange={setQuery}
                width={280}
              />
              <Text size="sm" type="supporting">
                共 {rows.length} 个因子 · 已选 {selectedSet.size}
              </Text>
              <Button
                label="全选当前列表"
                variant="ghost"
                size="sm"
                isDisabled={filteredRows.every((row) => selectedSet.has(row.factorName))}
                onClick={() => setSelected(filteredRows.map((row) => row.factorName))}
              />
              <Button
                label="清空选择"
                variant="ghost"
                size="sm"
                isDisabled={selectedSet.size === 0}
                onClick={() => setSelected([])}
              />
            </HStack>
            <Table<CompareRow>
              idKey="factorName"
              columns={COMPARE_COLUMNS}
              data={sortedData}
              density="compact"
              dividers="rows"
              hasHover
              plugins={plugins}
            />
          </VStack>
        </Section>
      </VStack>
    );
  }

  return (
    <VStack gap={4}>
      <HStack gap={3} align="center" style={{ justifyContent: "space-between" }}>
        <VStack gap={1}>
          <Heading level={2}>因子衰退对比</Heading>
          <Text type="supporting">
            对比多个因子在不同持有期的预测能力衰减：曲线越高越平、半衰期与保留率越高，信号越耐用。
          </Text>
        </VStack>
        <Link to="/home/factors" style={{ textDecoration: "none" }}>
          <Button label="← 返回因子列表" variant="ghost" size="sm" />
        </Link>
      </HStack>

      {content}
    </VStack>
  );
}
