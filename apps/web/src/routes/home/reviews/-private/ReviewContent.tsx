/**
 * 复盘内容渲染组件 — 今日复盘与历史复盘详情共用。
 *
 * 核心设计：UI 不再写死模块类型，而是完全由「服务端返回的自描述 sections」驱动。
 * 服务端依据 skill.sections（输出模块配置：type/title/chart）与复盘数据组装 sections：
 *   { type, title, chart, data }
 * 前端仅按 chart 类型（bar/table/text/card）通用渲染，新增/调整模块无需改前端代码。
 *
 * 历史复盘与今日复盘一致：服务端用「该条复盘快照的 skill.sections」组装 sections，
 * 因此历史数据也能直接渲染，且与生成时结构保持一致（可追溯、可复现）。
 */
import { memo, useEffect, useRef } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Table, proportional } from "@astryxdesign/core/Table";
import { echarts } from "../../../../lib/echarts";
import type { ECharts, TooltipComponentFormatterCallbackParams } from "echarts";
import {
  chartAxisText,
  chartUp,
  chartDown,
  chartCurrent,
  splitLineStyle,
  axisLineStyle,
} from "../../../../lib/theme";
import type {
  Review,
  ReviewSection,
  FundFlowItem,
  MainlineItem,
  ReviewStockPoolItem,
  LimitUpPoolItem,
  MarketEmotionResult,
  DimensionSectionData,
  DimensionBoard,
} from "../../../../hooks/useReviews";
import { fmtFlow } from "../../../../lib/format";

// ---------- 通用工具 ----------

/** 数值 → 中文量级（万/亿），用于轴刻度与 tooltip */
function formatNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return String(v);
}

/** 单元格值 → 展示文本（null/对象兜底） */
function formatCell(v: unknown): string {
  if (v == null) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** 判断数据是否为「空」：空数组 / 空字符串视为空，null 由 SectionRenderer 统一按空状态处理 */
function isEmptyData(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "string") return !data.trim();
  return false;
}

// ---------- 空状态 ----------

function EmptyState() {
  return (
    <div
      style={{
        background: "var(--color-background-card)",
        border: "1px dashed var(--color-border)",
        borderRadius: "var(--radius-md, 8px)",
        padding: "var(--spacing-6)",
      }}
    >
      <Text type="supporting" style={{ textAlign: "center" }}>
        暂无数据
      </Text>
    </div>
  );
}

// ---------- 通用柱状图（ECharts） ----------

/**
 * 通用横向柱状图：label 轴 + value 值轴，红涨绿跌（A 股惯例）。
 * 对 label/value 做轻量自动推断，避免与具体业务字段耦合。
 */
const BarChart = memo(function BarChart({
  rows,
  labelKey,
  valueKey,
}: {
  rows: Record<string, unknown>[];
  labelKey: string | undefined;
  valueKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    chartRef.current = echarts.init(containerRef.current, undefined, { renderer: "svg" });
    const handleResize = () => chartRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const fallbackLabelKey = Object.keys(rows[0] ?? {})[0];
    const sorted = [...rows]
      .map((r) => ({
        label: formatCell(r[labelKey ?? fallbackLabelKey ?? ""]),
        value: Number(r[valueKey]) || 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
      .reverse();

    chartRef.current.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: TooltipComponentFormatterCallbackParams) => {
            if (!Array.isArray(params) || !params[0]) return "";
            const d = sorted[params[0].dataIndex];
            return d ? `<strong>${d.label}</strong><br/>${formatNumber(d.value)}` : "";
          },
        },
        grid: { left: 84, right: 60, top: 10, bottom: 24 },
        xAxis: {
          type: "value",
          axisLabel: { color: chartAxisText(), formatter: (v: number) => formatNumber(v) },
          ...splitLineStyle,
        },
        yAxis: {
          type: "category",
          data: sorted.map((d) => d.label),
          axisLabel: { color: chartAxisText(), fontSize: 11 },
          axisTick: { show: false },
          ...axisLineStyle,
        },
        series: [
          {
            type: "bar",
            barMaxWidth: 16,
            data: sorted.map((d) => ({
              value: d.value,
              itemStyle: { color: d.value >= 0 ? chartUp() : chartDown() },
            })),
          },
        ],
      },
      { notMerge: true },
    );
  }, [rows, labelKey, valueKey]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: Math.max(320, Math.min(560, rows.length * 26)),
        minHeight: 0,
        background: "var(--color-background-card)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
});

// ---------- 通用卡片列表 ----------

/** 无明确数值字段时的降级展示：对象数组 → 卡片（首个文本字段为标题，其余为描述） */
function CardList({ data }: { data: unknown }) {
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  if (rows.length === 0) return <EmptyState />;
  const labelKeys = ["name", "title", "label", "boardName"];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(rows.length, 3)}, 1fr)`,
        gap: "var(--spacing-4)",
        width: "100%",
      }}
    >
      {rows.map((row, i) => {
        const labelKey = labelKeys.find((k) => row[k] != null) ?? Object.keys(row)[0];
        const label = labelKey ? formatCell(row[labelKey]) : "";
        const desc = Object.entries(row)
          .filter(([k, v]) => k !== labelKey && v != null)
          .map(([, v]) => formatCell(v))
          .join(" · ");
        return (
          <div
            key={i}
            style={{
              background: "var(--color-background-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md, 8px)",
              padding: "var(--spacing-5)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 4,
                height: "100%",
                background: "var(--color-accent)",
              }}
            />
            <VStack gap={2}>
              <Text style={{ fontWeight: 700, fontSize: 20 }}>{label}</Text>
              {desc && (
                <Text type="supporting" size="sm" style={{ lineHeight: 1.6 }}>
                  {desc}
                </Text>
              )}
            </VStack>
          </div>
        );
      })}
    </div>
  );
}

// ---------- 通用表格 ----------

/** 通用表格：自动从数据推断列，单元格统一文本展示 */
function GenericTable({ data }: { data: unknown }) {
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  if (rows.length === 0) return <EmptyState />;
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const columns = keys.map((key) => ({
    key,
    header: key,
    width: proportional(1),
    renderCell: (row: Record<string, unknown>) => (
      <Text style={{ fontSize: 13 }}>{formatCell(row[key])}</Text>
    ),
  }));
  return (
    <Table<Record<string, unknown>>
      columns={columns}
      data={rows}
      density="compact"
      dividers="rows"
      hasHover
    />
  );
}

// ---------- 通用文本 ----------

/** 通用文本块：字符串直接展示，对象/数组以 JSON 兜底 */
function TextBlock({ data }: { data: unknown }) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return (
    <div
      style={{
        background: "var(--color-background-card)",
        border: "1px solid var(--color-border)",
        borderLeft: "4px solid var(--color-accent)",
        borderRadius: "var(--radius-md, 8px)",
        padding: "var(--spacing-4)",
      }}
    >
      <Text style={{ lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{text}</Text>
    </div>
  );
}

// ---------- 未知类型兜底 ----------

/** 未知 chart 类型兜底：数组 → 表格，其余 → 文本 */
function FallbackBlock({ data }: { data: unknown }) {
  if (Array.isArray(data)) return <GenericTable data={data} />;
  return <TextBlock data={data} />;
}

// ---------- 资金流向（行业 / 概念 / 个股 三档排行榜） ----------

/** 单档资金流排行榜：纯 HTML 条形，轻量且红涨绿跌 */
function FundFlowLeaderboard({ title, rows }: { title: string; rows: FundFlowItem[] }) {
  const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.mainNetInflow ?? 0)), 0);
  return (
    <div
      style={{
        background: "var(--color-background-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md, 8px)",
        padding: "var(--spacing-4)",
        minWidth: 0,
      }}
    >
      <Text style={{ fontWeight: 700, fontSize: 14, marginBottom: "var(--spacing-3)" }}>
        {title}
      </Text>
      <VStack gap={2}>
        {rows.map((r) => {
          const inflow = r.mainNetInflow ?? 0;
          const width = maxAbs > 0 ? (Math.abs(inflow) / maxAbs) * 100 : 0;
          const color = inflow >= 0 ? chartUp() : chartDown();
          return (
            <div
              key={r.code}
              style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}
            >
              <Text
                size="sm"
                style={{
                  width: 16,
                  textAlign: "right",
                  flexShrink: 0,
                  color: "var(--color-text-supporting)",
                }}
              >
                {r.rank}
              </Text>
              <Text
                size="sm"
                style={{
                  width: 68,
                  flexShrink: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.name}
              </Text>
              <div
                style={{
                  flex: 1,
                  height: 10,
                  background: "var(--color-background-subtle)",
                  borderRadius: 5,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{ width: `${width}%`, height: "100%", background: color, borderRadius: 5 }}
                />
              </div>
              <Text size="sm" style={{ width: 62, textAlign: "right", flexShrink: 0, color }}>
                {fmtFlow(r.mainNetInflow)}
              </Text>
            </div>
          );
        })}
      </VStack>
    </div>
  );
}

/** 资金流向模块：行业 / 概念 / 个股 各 top5 */
function FundFlowBlock({ data }: { data: unknown }) {
  const d = (data ?? {}) as {
    industry?: FundFlowItem[];
    concept?: FundFlowItem[];
    stock?: FundFlowItem[];
  };
  const industry = d.industry ?? [];
  const concept = d.concept ?? [];
  const stock = d.stock ?? [];
  if (industry.length === 0 && concept.length === 0 && stock.length === 0) return <EmptyState />;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "var(--spacing-4)",
        width: "100%",
      }}
    >
      <FundFlowLeaderboard title="行业资金流 Top5" rows={industry} />
      <FundFlowLeaderboard title="概念资金流 Top5" rows={concept} />
      <FundFlowLeaderboard title="个股资金流 Top5" rows={stock} />
    </div>
  );
}

// ---------- 主线（板块 + 核心个股 + 六维得分） ----------

/** 六维标签与权重（与服务端 MAINLINE_DEF 对齐），用于主线卡片内的得分条 */
const MAINLINE_DIMS = [
  { label: "方向持续性", weight: 18, field: "directionScore" },
  { label: "资金聚焦", weight: 20, field: "fundScore" },
  { label: "龙头梯队", weight: 18, field: "leaderScore" },
  { label: "赚钱效应", weight: 12, field: "effectScore" },
  { label: "题材催化", weight: 16, field: "themeScore" },
  { label: "机构/游资确认", weight: 16, field: "dragonScore" },
] as const;

/** 标签 + 分数进度条（score/max 决定宽度），维度与子指标得分共用 */
function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (score / max) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
      <Text size="sm" style={{ width: 96, flexShrink: 0, color: "var(--color-text-supporting)" }}>
        {label}
      </Text>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "var(--color-background-subtle)",
          overflow: "hidden",
        }}
      >
        <div
          style={{ width: `${pct}%`, height: "100%", background: "var(--color-accent)", borderRadius: 3 }}
        />
      </div>
      <Text size="sm" style={{ width: 60, textAlign: "right", flexShrink: 0 }}>
        {score.toFixed(1)}/{max}
      </Text>
    </div>
  );
}

/** 主线维度模块：单维度的子指标得分 + 该维度领先板块（各取前 5） */
function DimensionBlock({ data }: { data: unknown }) {
  const dim = data as DimensionSectionData | null;
  if (!dim || dim.boards.length === 0) return <EmptyState />;
  return (
    <div
      style={{
        background: "var(--color-background-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md, 8px)",
        padding: "var(--spacing-4)",
        width: "100%",
      }}
    >
      <VStack gap={4}>
        <HStack gap={2} align="center">
          <Text style={{ fontWeight: 700, fontSize: 16 }}>{dim.label}</Text>
          <Text size="sm" type="supporting">
            权重 {dim.weight} 分
          </Text>
        </HStack>
        {dim.boards.map((b) => (
          <div
            key={b.boardName}
            style={{
              borderTop: "1px solid var(--color-border)",
              paddingTop: "var(--spacing-3)",
            }}
          >
            <VStack gap={2}>
              <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
                <Text style={{ fontWeight: 600 }}>{b.boardName}</Text>
                <Text size="sm" type="supporting">
                  维度 {b.dimScore.toFixed(1)} · 总分 {b.totalScore.toFixed(1)}
                </Text>
              </HStack>
              {b.subs.map((s) => (
                <ScoreBar key={s.key} label={s.label} score={s.score} max={s.weight} />
              ))}
            </VStack>
          </div>
        ))}
      </VStack>
    </div>
  );
}

function MainlineBlock({ data }: { data: unknown }) {
  const rows = (Array.isArray(data) ? data : []) as MainlineItem[];
  if (rows.length === 0) return <EmptyState />;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(rows.length, 3)}, 1fr)`,
        gap: "var(--spacing-4)",
        width: "100%",
      }}
    >
      {rows.map((m, i) => (
        <div
          key={`${m.boardCode || m.boardName}-${i}`}
          style={{
            background: "var(--color-background-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md, 8px)",
            padding: "var(--spacing-5)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 4,
              height: "100%",
              background: "var(--color-accent)",
            }}
          />
          <VStack gap={3}>
            <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
              <Text
                style={{ color: "var(--color-accent)", fontWeight: 700, fontSize: 28, lineHeight: 1 }}
              >
                {String(i + 1).padStart(2, "0")}
              </Text>
              <Text style={{ fontWeight: 700, fontSize: 18, flex: 1 }}>{m.boardName}</Text>
              <Text style={{ fontWeight: 700, fontSize: 22, color: "var(--color-accent)" }}>
                {Number(m.score ?? 0).toFixed(1)}
              </Text>
            </HStack>
            <VStack gap={1}>
              {MAINLINE_DIMS.map((dim) => (
                <ScoreBar
                  key={dim.label}
                  label={dim.label}
                  score={Number(m[dim.field] ?? 0)}
                  max={dim.weight}
                />
              ))}
            </VStack>
            {m.coreStocks?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-2)" }}>
                {m.coreStocks.map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "var(--color-background-subtle)",
                      border: "1px solid var(--color-border)",
                      fontSize: 12,
                      color: "var(--color-text)",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            {m.reason && (
              <Text type="supporting" size="sm" style={{ lineHeight: 1.6 }}>
                {m.reason}
              </Text>
            )}
          </VStack>
        </div>
      ))}
    </div>
  );
}

// ---------- 选股池（今日列表 + 上日新增/移除） ----------

/** 选股池条目 chip（tone 控制增减语义色） */
function StockPoolChip({
  item,
  tone,
}: {
  item: ReviewStockPoolItem;
  tone: "add" | "remove" | "plain";
}) {
  const borderColor =
    tone === "add"
      ? "var(--color-chart-up, #e5484d)"
      : tone === "remove"
        ? "var(--color-chart-down, #30a46c)"
        : "var(--color-border)";
  const prefix = tone === "add" ? "+" : tone === "remove" ? "-" : "";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: "var(--radius-sm, 6px)",
        background: "var(--color-background-subtle)",
        border: `1px solid ${borderColor}`,
        fontSize: 13,
      }}
    >
      {prefix && <span style={{ color: borderColor, fontWeight: 700 }}>{prefix}</span>}
      <span style={{ fontWeight: 600 }}>{item.name}</span>
      <span style={{ color: "var(--color-text-supporting)" }}>{item.symbol}</span>
    </span>
  );
}

/** 选股池模块：今日列表 + 与上一交易日相比的新增/移除 */
function StockPoolBlock({ data }: { data: unknown }) {
  console.log("StockPoolBlock data", data);
  const d = (data ?? {}) as {
    today?: ReviewStockPoolItem[];
    added?: ReviewStockPoolItem[];
    removed?: ReviewStockPoolItem[];
  };
  const today = d.today ?? [];
  const added = d.added ?? [];
  const removed = d.removed ?? [];
  if (today.length === 0 && added.length === 0 && removed.length === 0) return <EmptyState />;

  const group = (title: string, items: ReviewStockPoolItem[], tone: "add" | "remove" | "plain") => (
    <VStack gap={2} style={{ width: "100%" }}>
      <Text size="sm" style={{ fontWeight: 700 }}>
        {title}
      </Text>
      {items.length === 0 ? (
        <Text size="sm" type="supporting">
          无
        </Text>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-2)" }}>
          {items.map((it) => (
            <StockPoolChip key={it.symbol} item={it} tone={tone} />
          ))}
        </div>
      )}
    </VStack>
  );

  return (
    <div
      style={{
        background: "var(--color-background-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md, 8px)",
        padding: "var(--spacing-4)",
        width: "100%",
      }}
    >
      <VStack gap={4}>
        <HStack gap={3} align="center">
          <Text style={{ fontWeight: 700, fontSize: 16 }}>今日选股池</Text>
          <Text size="sm" type="supporting">
            共 {today.length} 只 · 新增 {added.length} · 移除 {removed.length}
          </Text>
        </HStack>
        {group("新增", added, "add")}
        {group("移除", removed, "remove")}
        {group("今日列表", today, "plain")}
      </VStack>
    </div>
  );
}

// ---------- 涨停池 / 连板梯队 ----------

/** 涨停池条目 chip（连板梯队用） */
function PoolChip({ item }: { item: LimitUpPoolItem }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: "var(--radius-sm, 6px)",
        background: "var(--color-background-subtle)",
        border: "1px solid var(--color-border)",
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 600 }}>{item.name}</span>
      {item.industry && (
        <span style={{ color: "var(--color-text-supporting)" }}>{item.industry}</span>
      )}
    </span>
  );
}

/** 涨停池模块：涨停/炸板/封板率/最高连板 + 连板梯队（按连板数降序分组） */
function LimitUpPoolBlock({ data }: { data: unknown }) {
  const rows = (Array.isArray(data) ? data : []) as LimitUpPoolItem[];
  if (rows.length === 0) return <EmptyState />;

  const sealed = rows.filter((r) => r.isLimitUp);
  const busted = rows.filter((r) => !r.isLimitUp);
  const maxBoard = rows.reduce((m, r) => Math.max(m, r.limitUpCount), 0);
  const sealRate = rows.length > 0 ? (sealed.length / rows.length) * 100 : 0;

  // 封板股按连板数分组（降序）
  const ladder = new Map<number, LimitUpPoolItem[]>();
  for (const r of sealed) {
    const arr = ladder.get(r.limitUpCount) ?? [];
    arr.push(r);
    ladder.set(r.limitUpCount, arr);
  }
  const ladderEntries = [...ladder.entries()].sort((a, b) => b[0] - a[0]);

  const boardLabel = (n: number) =>
    n >= 4 ? `${n} 板（高度板）` : n === 3 ? "3 板" : n === 2 ? "2 板" : "首板";

  const stats = [
    { label: "涨停", value: `${sealed.length} 家` },
    { label: "炸板", value: `${busted.length} 家` },
    { label: "封板率", value: `${sealRate.toFixed(0)}%` },
    { label: "最高连板", value: `${maxBoard} 板` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)", width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--spacing-3)" }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--color-background-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md, 8px)",
              padding: "var(--spacing-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-1)",
            }}
          >
            <Text type="supporting" size="sm">
              {s.label}
            </Text>
            <Text style={{ fontWeight: 700, fontSize: 20 }}>{s.value}</Text>
          </div>
        ))}
      </div>
      <VStack gap={3} style={{ width: "100%" }}>
        {ladderEntries.map(([board, items]) => (
          <div
            key={board}
            style={{ display: "flex", alignItems: "flex-start", gap: "var(--spacing-3)" }}
          >
            <Text
              size="sm"
              style={{ width: 96, flexShrink: 0, fontWeight: 700, color: "var(--color-accent)" }}
            >
              {boardLabel(board)}
            </Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-2)" }}>
              {items.map((it) => (
                <PoolChip key={it.symbol} item={it} />
              ))}
            </div>
          </div>
        ))}
      </VStack>
    </div>
  );
}

// ---------- 市场情绪温度 ----------

/** 温度 → 语义色（A 股惯例：红热 / 绿冷，中间用琥珀） */
function emotionColor(temp: number): string {
  if (temp >= 60) return chartUp();
  if (temp >= 40) return chartCurrent();
  return chartDown();
}

/** 温度 → 冷热标签 */
function emotionLabel(temp: number): string {
  if (temp >= 70) return "火热";
  if (temp >= 60) return "偏热";
  if (temp >= 40) return "温和";
  if (temp >= 20) return "偏冷";
  return "冰点";
}

/** 市场情绪温度模块：大数字温度 + 0~100 温度条 + 三维度得分 + 原始指标 */
function MarketEmotionBlock({ data }: { data: unknown }) {
  const e = data as MarketEmotionResult | null;
  if (!e) return <EmptyState />;
  const temp = Math.max(0, Math.min(100, e.temperature));
  const color = emotionColor(temp);

  const dims = [
    { key: "scale", label: "涨停规模", score: e.dimScores?.scale ?? 0 },
    { key: "quality", label: "封板质量", score: e.dimScores?.quality ?? 0 },
    { key: "height", label: "连板高度", score: e.dimScores?.height ?? 0 },
  ];
  const rawStats = [
    { label: "涨停", value: `${e.limitUpCount} 家` },
    { label: "炸板率", value: `${(e.bustRate * 100).toFixed(1)}%` },
    { label: "最高连板", value: `${e.maxConsecutive} 板` },
  ];

  return (
    <div
      style={{
        background: "var(--color-background-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md, 8px)",
        padding: "var(--spacing-5)",
        width: "100%",
      }}
    >
      <HStack gap={5} align="center" style={{ flexWrap: "wrap" }}>
        <VStack gap={1} align="center" style={{ minWidth: 132 }}>
          <Text style={{ fontSize: 64, fontWeight: 700, lineHeight: 1, color }}>
            {Math.round(temp)}
          </Text>
          <Text size="sm" style={{ fontWeight: 700, color }}>
            {emotionLabel(temp)}
          </Text>
        </VStack>

        <VStack gap={4} style={{ flex: 1, minWidth: 260 }}>
          <div style={{ width: "100%" }}>
            <div
              style={{
                height: 10,
                borderRadius: 5,
                background: "var(--color-background-subtle)",
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${temp}%`, height: "100%", background: color, borderRadius: 5 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--spacing-1)" }}>
              <Text size="sm" type="supporting">0</Text>
              <Text size="sm" type="supporting">50</Text>
              <Text size="sm" type="supporting">100</Text>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
            {dims.map((d) => (
              <div key={d.key} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
                <Text size="sm" style={{ width: 72, flexShrink: 0 }}>
                  {d.label}
                </Text>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    background: "var(--color-background-subtle)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(Math.max(d.score, 0), 100)}%`,
                      height: "100%",
                      background: "var(--color-accent)",
                      borderRadius: 4,
                    }}
                  />
                </div>
                <Text size="sm" style={{ width: 40, textAlign: "right", flexShrink: 0 }}>
                  {d.score.toFixed(1)}
                </Text>
              </div>
            ))}
          </div>
        </VStack>

        <VStack gap={2} style={{ minWidth: 120 }}>
          {rawStats.map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-3)" }}>
              <Text size="sm" type="supporting">
                {s.label}
              </Text>
              <Text size="sm" style={{ fontWeight: 600 }}>
                {s.value}
              </Text>
            </div>
          ))}
        </VStack>
      </HStack>
    </div>
  );
}

// ---------- 通用渲染器 ----------

/**
 * 模块渲染器：优先按模块 type 分派到专用渲染组件（fundflow/mainline/stockpool，
 * 数据为对象/专门结构，不受 skill 的 chart 配置影响）；无专用组件的模块
 * 再按 chart 类型通用渲染（bar/table/text/card）。
 * data == null（未知模块类型）或空数据时显示空状态。
 */
function SectionRenderer({ section }: { section: ReviewSection }) {
  const { type, chart, data } = section;
  if (data == null) return <EmptyState />;
  if (isEmptyData(data)) return <EmptyState />;

  // 专用模块组件（按 type 语义分派，chart 配置不再破坏渲染）
  switch (type) {
    case "fundflow":
      return <FundFlowBlock data={data} />;
    case "mainline_dim":
      return <DimensionBlock data={data} />;
    case "mainline":
      return <MainlineBlock data={data} />;
    case "stockpool":
      return <StockPoolBlock data={data} />;
    default:
      break;
  }

  switch (chart) {
    case "bar": {
      // bar 图需要 label + 数值字段；无数值字段时降级为卡片列表
      const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
      const first = rows[0];
      if (!first) return <EmptyState />;
      const keys = Object.keys(first);
      const labelKey =
        ["name", "title", "label", "boardName"].find((k) => keys.includes(k)) ??
        keys.find((k) => typeof first[k] === "string");
      const valueKey =
        ["mainNetInflow", "value", "delta", "consecutiveCount"].find(
          (k) => typeof first[k] === "number",
        ) ?? keys.find((k) => typeof first[k] === "number");
      if (!valueKey) return <CardList data={data} />;
      return <BarChart rows={rows} labelKey={labelKey} valueKey={valueKey} />;
    }
    case "table":
      return <GenericTable data={data} />;
    case "text":
      return <TextBlock data={data} />;
    case "card":
      return <CardList data={data} />;
    // 兼容历史/自定义 skill 直接以 chart 指定专用组件的情况
    case "fundflow":
      return <FundFlowBlock data={data} />;
    case "mainline":
      return <MainlineBlock data={data} />;
    case "dimension":
      return <DimensionBlock data={data} />;
    case "limitup_pool":
      return <LimitUpPoolBlock data={data} />;
    case "market_emotion":
      return <MarketEmotionBlock data={data} />;
    case "stockpool":
      return <StockPoolBlock data={data} />;
    default:
      return <FallbackBlock data={data} />;
  }
}

// ---------- 模块列表 ----------

function ReviewSectionBlock({ section }: { section: ReviewSection }) {
  return (
    <VStack gap={3}>
      <Text style={{ fontWeight: 700, fontSize: 16 }}>{section.title}</Text>
      <SectionRenderer section={section} />
    </VStack>
  );
}

/**
 * 渲染自描述 sections 列表。今日生成结果与历史复盘复用此组件，
 * 按模块 chart 类型分派到对应渲染组件（fundflow/mainline/stockpool/bar/table/text/card）。
 */
export function ReviewSections({ sections }: { sections: ReviewSection[] }) {
  if (sections.length === 0) {
    return <Text type="supporting">暂无可用模块。</Text>;
  }
  return (
    <VStack gap={4}>
      {sections.map((section, i) => (
        <ReviewSectionBlock key={`${section.type}-${i}`} section={section} />
      ))}
    </VStack>
  );
}

// ---------- 主组件 ----------

export function ReviewContent({ review }: { review: Review }) {
  return (
    <VStack gap={4}>
      <ReviewSections sections={review.sections ?? []} />
    </VStack>
  );
}
