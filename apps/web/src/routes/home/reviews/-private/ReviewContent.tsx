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
import { Info } from "lucide-react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Table, proportional } from "@astryxdesign/core/Table";
import { echarts } from "../../../../lib/echarts";
import type { ECharts, TooltipComponentFormatterCallbackParams } from "echarts";
import {
  chartAxisText,
  chartUp,
  chartDown,
  splitLineStyle,
  axisLineStyle,
} from "../../../../lib/theme";
import type {
  Review,
  ReviewSection,
  ReviewSkill,
  FundFlowItem,
  MainlineItem,
  ReviewStockPoolItem,
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

/** 判断数据是否为「空」：空数组 / 空字符串视为空，null 交由调用方单独处理（流式占位） */
function isEmptyData(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "string") return !data.trim();
  return false;
}

// ---------- 空状态 / 占位 ----------

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

/** 流式生成中模块占位（data 尚未推送到位时展示） */
function StreamingPlaceholder() {
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
        生成中…
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
      <Text style={{ fontWeight: 700, fontSize: 14, marginBottom: "var(--spacing-3)" }}>{title}</Text>
      <VStack gap={2}>
        {rows.map((r) => {
          const inflow = r.mainNetInflow ?? 0;
          const width = maxAbs > 0 ? (Math.abs(inflow) / maxAbs) * 100 : 0;
          const color = inflow >= 0 ? chartUp() : chartDown();
          return (
            <div key={r.code} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
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
                <div style={{ width: `${width}%`, height: "100%", background: color, borderRadius: 5 }} />
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
  const d = (data ?? {}) as { industry?: FundFlowItem[]; concept?: FundFlowItem[]; stock?: FundFlowItem[] };
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

// ---------- 主线（板块 + 核心个股） ----------

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
          key={`${m.boardName}-${i}`}
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
            <Text style={{ color: "var(--color-accent)", fontWeight: 700, fontSize: 28, lineHeight: 1 }}>
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Text style={{ fontWeight: 700, fontSize: 18 }}>{m.boardName}</Text>
            {m.coreStocks.length > 0 && (
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
function StockPoolChip({ item, tone }: { item: ReviewStockPoolItem; tone: "add" | "remove" | "plain" }) {
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

// ---------- 通用渲染器 ----------

/**
 * 通用模块渲染器：仅按 chart 类型分派渲染，不关心具体模块语义。
 * data == null 表示流式生成中尚未推送，显示占位；空数据显示空状态。
 */
function SectionRenderer({ section }: { section: ReviewSection }) {
  const { chart, data } = section;
  if (data == null) return <StreamingPlaceholder />;
  if (isEmptyData(data)) return <EmptyState />;

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
    case "fundflow":
      return <FundFlowBlock data={data} />;
    case "mainline":
      return <MainlineBlock data={data} />;
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
 * 渲染自描述 sections 列表。today 页流式生成与历史/最终渲染均复用此组件，
 * 因此"边生成边渲染"与"历史直接渲染"走同一套通用渲染逻辑。
 */
export function ReviewSections({ sections }: { sections: ReviewSection[] }) {
  if (sections.length === 0) {
    return <Text type="supporting">暂无可用模块，请检查 Skill 配置。</Text>;
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

export function ReviewContent({
  review,
  skillChanged = false,
}: {
  review: Review;
  /** 快照 skill 的 sections 与当前 skill 是否不同 */
  skillChanged?: boolean;
}) {
  return (
    <VStack gap={4}>
      {skillChanged && (
        <HStack
          gap={2}
          align="center"
          style={{
            background: "var(--color-background-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md, 8px)",
            padding: "var(--spacing-3)",
          }}
        >
          <Info size={16} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
          <Text size="sm" type="supporting">
            此复盘使用生成时的 Skill 版本，当前 Skill 已更新，模块结构可能与最新配置不同。
          </Text>
        </HStack>
      )}

      <ReviewSections sections={review.sections ?? []} />
    </VStack>
  );
}

/** 判断两个 skill 的 sections（UI 模块结构）是否不同 */
export function sectionsChanged(a?: ReviewSkill | null, b?: ReviewSkill | null): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a.sections) !== JSON.stringify(b.sections);
}
