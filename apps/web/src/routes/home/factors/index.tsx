import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Code } from "@astryxdesign/core/Code";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { Table, proportional, useTableStickyColumns } from "@astryxdesign/core/Table";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Sparkles } from "lucide-react";
import { FactorExpressionReference } from "../../../components/FactorExpressionReference";
import { FactorCodeReference } from "../../../components/FactorCodeReference";
import { AKQUANT_FACTOR_EXPRESSIONS } from "../../../lib/akquantFactors";
import {
  useFactorsQuery,
  useFactorEvaluationsQuery,
  useFactorEvaluationStatus,
  useRefreshFactorEvaluations,
  formatFactorCategory,
  factorCategoryGroup,
  FACTOR_KIND_LABELS,
  normalizeFactorKind,
  type FactorKind,
  type FactorEvaluationRow,
} from "../../../hooks/useFactors";

type FactorRow = Record<string, unknown> & {
  name: string;
  label: string;
  category: string;
  kind: FactorKind;
  expression: string;
  code: string;
  creator: string;
  isPublic: boolean;
  /** 该因子最近一次落库的检验结果；未检验时为 null */
  eval: FactorEvaluationRow | null;
};

/** 取 Python 代码的首个非空行作为列表摘要 */
function firstCodeLine(code: string): string {
  return (
    code
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? ""
  );
}

/**
 * 因子指标单元格：缺值显示占位符；isColored 时按正负着色（仅用于「多空年化」这类盈亏口径，
 * IC / ICIR 的正负依赖因子方向，不用颜色暗示好坏）。
 */
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

/** 检验状态单元格：未检验 / 失败（悬停看原因）/ 最近检验日期（悬停看样本区间） */
function EvalStatusCell({ evaluation }: { evaluation: FactorEvaluationRow | null }) {
  if (!evaluation) return <Text type="supporting">未检验</Text>;

  if (evaluation.error) {
    return (
      <HoverCard
        content={<Text size="sm">{evaluation.error}</Text>}
        placement="below"
        alignment="start"
        hasHoverIndication
      >
        <Badge label="失败" variant="error" />
      </HoverCard>
    );
  }

  return (
    <HoverCard
      content={
        <Text size="sm">
          {evaluation.symbols} 只 × {evaluation.bars} 交易日（{evaluation.startDate} ~{" "}
          {evaluation.endDate}）
        </Text>
      }
      placement="below"
      alignment="start"
      hasHoverIndication
    >
      <Text type="supporting">{evaluation.updatedAt.slice(0, 10)}</Text>
    </HoverCard>
  );
}

/** 指标列表头：标题旁附 info 图标，悬停显示「口径 + 经验判断参考」 */
function MetricHeader({
  label,
  desc,
  guide,
  note,
}: {
  label: string;
  desc: string;
  guide: string;
  note?: string;
}) {
  return (
    <HStack gap={1} align="center">
      <Text type="label" size="sm">
        {label}
      </Text>
      <HoverCard
        content={
          <VStack gap={1} style={{ maxWidth: 300 }}>
            <Text size="sm">{desc}</Text>
            <Text size="sm" type="supporting">
              {guide}
            </Text>
            {note ? (
              <Text size="sm" type="supporting">
                {note}
              </Text>
            ) : null}
          </VStack>
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

const FACTOR_COLUMNS = [
  {
    key: "label",
    header: "名称",
    width: proportional(2),
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
    key: "kind",
    header: "方式",
    width: proportional(1),
    renderCell: (row: FactorRow) => <Badge label={FACTOR_KIND_LABELS[row.kind]} />,
  },
  {
    key: "definition",
    header: "定义",
    width: proportional(2),
    renderCell: (row: FactorRow) => {
      if (row.kind === "python") {
        const summary = firstCodeLine(row.code);
        return summary ? <Code>{summary}</Code> : <Text type="supporting">Python 代码</Text>;
      }
      return row.expression ? <Code>{row.expression}</Code> : <Text type="supporting">—</Text>;
    },
  },
  {
    key: "icMean",
    header: (
      <MetricHeader
        label="IC"
        desc="逐日截面 Pearson 相关系数（因子值 vs 未来 1 日收益）的均值"
        guide="参考：|IC| ≥ 0.02 可用 · ≥ 0.05 良好 · ≥ 0.1 优秀（经验值）"
        note="正负仅表因子方向，不代表好坏；IC 随持有期下降越快，信号越短命（见因子详情页）"
      />
    ),
    width: proportional(1),
    renderCell: (row: FactorRow) => <MetricCell value={row.eval?.icMean} />,
  },
  {
    key: "rankIcMean",
    header: (
      <MetricHeader
        label="RankIC"
        desc="逐日截面 Spearman 秩相关系数的均值（抗极值）"
        guide="参考：|RankIC| ≥ 0.03 可用 · ≥ 0.05 良好（经验值）"
      />
    ),
    width: proportional(1),
    renderCell: (row: FactorRow) => <MetricCell value={row.eval?.rankIcMean} />,
  },
  {
    key: "icir",
    header: (
      <MetricHeader
        label="ICIR"
        desc="IC 均值 ÷ IC 标准差（日频、未年化），衡量 IC 的稳定性"
        guide="参考：日频 |ICIR| ≥ 0.3 可用 · ≥ 0.5 稳定 · ≥ 0.7 优秀"
      />
    ),
    width: proportional(1),
    renderCell: (row: FactorRow) => <MetricCell value={row.eval?.icir} />,
  },
  {
    key: "tStat",
    header: (
      <MetricHeader
        label="t 值"
        desc="ICIR × √有效天数，检验 IC 是否显著异于 0"
        guide="参考：|t| ≥ 2 显著 · ≥ 3 很显著"
      />
    ),
    width: proportional(1),
    renderCell: (row: FactorRow) => <MetricCell value={row.eval?.tStat} digits={2} />,
  },
  {
    key: "icPositiveRatio",
    header: (
      <MetricHeader
        label="IC>0 占比"
        desc="IC 为正的交易日占比，衡量信号方向的一致性"
        guide="参考：≥ 55% 较稳定，越高越稳"
      />
    ),
    width: proportional(1),
    renderCell: (row: FactorRow) => (
      <MetricCell value={row.eval?.icPositiveRatio} isPercent />
    ),
  },
  {
    key: "longShortAnnRet",
    header: (
      <MetricHeader
        label="多空年化"
        desc="按因子值分 5 层，做多最高层、做空最低层的日收益均值年化（后复权，持 1 日）"
        guide="参考：扣费前 ≥ 10% 可用 · ≥ 20% 较强；未扣交易成本"
      />
    ),
    width: proportional(1),
    renderCell: (row: FactorRow) => (
      <MetricCell value={row.eval?.longShortAnnRet} isPercent isColored />
    ),
  },
  {
    key: "turnoverMean",
    header: (
      <MetricHeader
        label="换手率"
        desc="相邻交易日各分层持仓的变动比例（分位换手，日频均值）"
        guide="参考：越低越省调仓成本；日频 ≥ 30% 通常偏高"
      />
    ),
    width: proportional(1),
    renderCell: (row: FactorRow) => <MetricCell value={row.eval?.turnoverMean} isPercent />,
  },
  {
    key: "rankAutocorrMean",
    header: (
      <MetricHeader
        label="秩自相关"
        desc="相邻交易日因子排名的 Spearman 相关均值（衡量排名稳定性）"
        guide="参考：≥ 0.9 很稳定 · ≥ 0.8 较稳定，越低换手越高"
      />
    ),
    width: proportional(1),
    renderCell: (row: FactorRow) => <MetricCell value={row.eval?.rankAutocorrMean} />,
  },
  {
    key: "evalStatus",
    header: "检验",
    width: proportional(1),
    renderCell: (row: FactorRow) => <EvalStatusCell evaluation={row.eval} />,
  },
  {
    key: "category",
    header: "分类",
    width: proportional(1),
    renderCell: (row: FactorRow) => <Badge label={formatFactorCategory(row.category)} />,
  },
  { key: "creator", header: "创建者", width: proportional(1) },
];

export const Route = createFileRoute("/home/factors/")({
  component: FactorsPage,
});

/** 大类 Tab 顺序（与 factorCategoryGroup 的返回值一致） */
const GROUP_ORDER = ["自定义分类", "Alpha101", "qlib · Alpha158", "qlib · Alpha360", "其他"];

/** 二级「全部分类」Tab 的哨兵值 */
const ALL_CATEGORY = "__all__";

function FactorsPage() {
  const { data: factors = [], isLoading } = useFactorsQuery();
  const { data: evaluations = [] } = useFactorEvaluationsQuery();
  const evaluationStatus = useFactorEvaluationStatus();
  const refreshEvaluations = useRefreshFactorEvaluations();

  const [group, setGroup] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // 名称列左固定：横向滚动时始终可见
  const stickyPlugin = useTableStickyColumns<FactorRow>({ startKeys: ["label"] });

  const evalByName = useMemo(() => {
    const map = new Map<string, FactorEvaluationRow>();
    for (const row of evaluations) map.set(row.factorName, row);
    return map;
  }, [evaluations]);

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
        isPublic: f.isPublic,
        eval: evalByName.get(f.name) ?? null,
      })),
    [factors, evalByName],
  );

  // 一级 Tab：按 factorCategoryGroup 归类的四大类，附带各自因子数量
  const groups = useMemo(() => {
    const countByGroup = new Map<string, number>();
    for (const row of rows) {
      const name = factorCategoryGroup(row.category);
      countByGroup.set(name, (countByGroup.get(name) ?? 0) + 1);
    }
    return GROUP_ORDER.filter((name) => countByGroup.has(name)).map((name) => ({
      name,
      count: countByGroup.get(name)!,
    }));
  }, [rows]);

  // 当前选中的大类；未选择时回退到第一个有数据的大类（异步加载后自动生效）
  const activeGroup = group ?? groups[0]?.name ?? "";

  const groupRows = useMemo(
    () => rows.filter((row) => factorCategoryGroup(row.category) === activeGroup),
    [rows, activeGroup],
  );

  // 二级 Tab：当前大类下的具体分类，按中文名排序
  const categoryTabs = useMemo(() => {
    const countByCategory = new Map<string, number>();
    for (const row of groupRows) {
      countByCategory.set(row.category, (countByCategory.get(row.category) ?? 0) + 1);
    }
    return [...countByCategory.entries()]
      .map(([value, count]) => ({ value, label: formatFactorCategory(value), count }))
      .toSorted((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
  }, [groupRows]);

  // 分类态可能因大类切换而失效，此处做一次兜底
  const activeCategory =
    category && categoryTabs.some((tab) => tab.value === category) ? category : null;

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return groupRows.filter((row) => {
      if (activeCategory && row.category !== activeCategory) return false;
      if (!keyword) return true;
      return (
        row.label.toLowerCase().includes(keyword) ||
        row.name.toLowerCase().includes(keyword) ||
        row.expression.toLowerCase().includes(keyword)
      );
    });
  }, [groupRows, activeCategory, query]);

  // 批量检验目标：当前筛选结果中的表达式因子（Python 代码因子暂不支持检验）
  const batchTargets = useMemo(
    () =>
      filteredRows.filter((row) => row.kind === "expression" && row.expression.trim().length > 0),
    [filteredRows],
  );

  const status = evaluationStatus.data;
  const isRunning = status?.status === "running";

  let listContent: ReactNode;
  if (isLoading) {
    listContent = <Spinner size="sm" label="加载中..." />;
  } else if (factors.length === 0) {
    listContent = <Text type="supporting">暂无因子</Text>;
  } else if (filteredRows.length === 0) {
    listContent = <Text type="supporting">没有符合筛选条件的因子</Text>;
  } else {
    listContent = (
      <Table<FactorRow>
        idKey="name"
        columns={FACTOR_COLUMNS}
        data={filteredRows}
        plugins={{ sticky: stickyPlugin }}
        density="balanced"
        dividers="rows"
        hasHover
        textOverflow="truncate"
      />
    );
  }

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
        <HStack gap={2} align="center">
          <Link to="/home/factors/compare" style={{ textDecoration: "none" }}>
            <Button label="衰退对比" variant="secondary" />
          </Link>
          <Link to="/home/factors/iterate" style={{ textDecoration: "none" }}>
            <Button label="AI 迭代" variant="secondary" icon={<Sparkles size={14} />} />
          </Link>
          <Link to="/home/factors/create" style={{ textDecoration: "none" }}>
            <Button label="创建因子" variant="primary" />
          </Link>
        </HStack>
      </HStack>

      {!isLoading && factors.length > 0 && (
        <VStack gap={3}>
          <TabList
            value={activeGroup}
            onChange={(value) => {
              setGroup(value);
              setCategory(null);
            }}
            hasDivider
          >
            {groups.map((item) => (
              <Tab key={item.name} value={item.name} label={`${item.name} (${item.count})`} />
            ))}
          </TabList>

          {categoryTabs.length > 1 && (
            <TabList
              value={activeCategory ?? ALL_CATEGORY}
              onChange={(value) => setCategory(value === ALL_CATEGORY ? null : value)}
              size="sm"
              style={{ flexWrap: "wrap" }}
            >
              <Tab value={ALL_CATEGORY} label={`全部 (${groupRows.length})`} />
              {categoryTabs.map((item) => (
                <Tab key={item.value} value={item.value} label={`${item.label} (${item.count})`} />
              ))}
            </TabList>
          )}

          <HStack gap={3} align="center" style={{ flexWrap: "wrap" }}>
            <TextInput
              label="搜索"
              isLabelHidden
              placeholder="搜索因子名称或表达式"
              startIcon="search"
              value={query}
              onChange={setQuery}
              width={280}
            />
            <Text size="sm" type="supporting">
              共 {filteredRows.length} 个因子
            </Text>
            <Button
              label={`批量检验（${batchTargets.length}）`}
              variant="secondary"
              size="sm"
              isLoading={refreshEvaluations.isPending}
              isDisabled={isRunning || batchTargets.length === 0}
              onClick={() =>
                refreshEvaluations.mutate({ names: batchTargets.map((row) => row.name) })
              }
            />
            <Text size="sm" type="supporting">
              指标来自最近一次批量检验（后复权 · 持有 1 日）
            </Text>
          </HStack>

          {isRunning && (
            <VStack gap={2}>
              <ProgressBar
                label="因子批量检验进度"
                value={status?.processed ?? 0}
                max={status?.total ?? 1}
                hasValueLabel
                formatValueLabel={(value, max) => `${value}/${max}`}
              />
              {status?.message ? (
                <Text size="sm" type="supporting">
                  {status.message}
                </Text>
              ) : null}
            </VStack>
          )}

          {status?.status === "failed" ? (
            <Text size="sm" style={{ color: "var(--color-text-negative)" }}>
              批量检验失败：{status.error ?? "未知原因"}
            </Text>
          ) : null}

          {!isRunning && status?.status === "success" && status.message ? (
            <Text size="sm" type="supporting">
              {status.message}
            </Text>
          ) : null}

          {refreshEvaluations.isError ? (
            <Text size="sm" style={{ color: "var(--color-text-negative)" }}>
              {(refreshEvaluations.error as Error).message}
            </Text>
          ) : null}
        </VStack>
      )}

      {listContent}
    </VStack>
  );
}
