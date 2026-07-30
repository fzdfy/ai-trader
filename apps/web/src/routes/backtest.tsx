import { useState, useCallback, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, proportional } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { EquityChart } from "../components/charts/EquityChart";
import { TradeChart } from "../components/charts/TradeChart";

// ==============================
// Types — 对齐 AKQuant 原生 report 结构
// ==============================

/** AKQuant report 概览 */
interface ReportInfo {
  symbol: string;
  strategy: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  initialCapital: number;
  finalEquity: number;
}

/** AKQuant 核心指标（12 项） */
interface BacktestMetrics {
  totalReturn: number;
  cagr: number;
  avgPnl: number;
  sharpeRatio: number;
  sortinoRatio: number | null;
  calmarRatio: number | null;
  maxDrawdown: number;
  volatility: number | null;
  winRate: number;
  profitFactor: number | null;
  kelly: number | null;
  totalTrades: number;
}

/** AKQuant 权益点 */
interface EquityPoint {
  time: string;
  equity: number;
  drawdown: number;
}

/** AKQuant 交易记录 */
type Trade = Record<string, unknown> & {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
};

/** Quant 服务返回的完整回测结果 */
interface BacktestResult {
  report: ReportInfo;
  metrics: BacktestMetrics;
  equity: EquityPoint[];
  trades: Trade[];
}

// ==============================
// Constants
// ==============================

const STRATEGY_OPTIONS = [
  { value: "ma_cross", label: "MA 双均线交叉" },
  { value: "rsi", label: "RSI 超买超卖" },
  { value: "macd", label: "MACD 信号交叉" },
  { value: "bollinger", label: "布林带突破" },
] as const;

const STRATEGY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  STRATEGY_OPTIONS.map((s) => [s.value, s.label]),
);

const TRADE_COLUMNS = [
  { key: "entryTime" as const, header: "买入日", width: proportional(1.5) },
  { key: "exitTime" as const, header: "卖出日", width: proportional(1.5) },
  { key: "entryPrice" as const, header: "买入价", width: proportional(1) },
  { key: "exitPrice" as const, header: "卖出价", width: proportional(1) },
  {
    key: "pnl" as const,
    header: "盈亏(元)",
    width: proportional(1),
    renderCell: (row: Trade) => {
      const color =
        row.pnl > 0 ? "var(--color-text-positive)" : "var(--color-text-negative)";
      return <Text style={{ color, fontWeight: 600 }}>{row.pnl.toFixed(2)}</Text>;
    },
  },
  {
    key: "pnlPct" as const,
    header: "收益率",
    width: proportional(1),
    renderCell: (row: Trade) => {
      const color =
        row.pnlPct > 0
          ? "var(--color-text-positive)"
          : "var(--color-text-negative)";
      return <Text style={{ color, fontWeight: 600 }}>{row.pnlPct.toFixed(2)}%</Text>;
    },
  },
];

const STRATEGY_DEFAULTS: Record<string, Record<string, number>> = {
  ma_cross: { fast: 5, slow: 20 },
  rsi: { period: 14, oversold: 30, overbought: 70 },
  macd: { fast: 12, slow: 26, signal: 9 },
  bollinger: { period: 20, multiplier: 2 },
};

const PARAM_DEFS: Record<string, { key: string; label: string; defaultValue: number }[]> = {
  ma_cross: [
    { key: "fast", label: "快线周期", defaultValue: 5 },
    { key: "slow", label: "慢线周期", defaultValue: 20 },
  ],
  rsi: [
    { key: "period", label: "RSI 周期", defaultValue: 14 },
    { key: "oversold", label: "超卖阈值", defaultValue: 30 },
    { key: "overbought", label: "超买阈值", defaultValue: 70 },
  ],
  macd: [
    { key: "fast", label: "快线 EMA", defaultValue: 12 },
    { key: "slow", label: "慢线 EMA", defaultValue: 26 },
    { key: "signal", label: "信号线", defaultValue: 9 },
  ],
  bollinger: [
    { key: "period", label: "布林周期", defaultValue: 20 },
    { key: "multiplier", label: "标准差倍数", defaultValue: 2 },
  ],
};

// ==============================
// Helper: 值格式化
// ==============================

function fmtPct(val: number | null | undefined): string {
  if (val == null) return "-";
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

function fmtNum(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "-";
  return val.toFixed(decimals);
}

function fmtMoney(val: number): string {
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ==============================
// Sub-components
// ==============================

/** 策略参数输入行 */
function ParamInputs({
  strategy,
  params,
  onChange,
}: {
  strategy: string;
  params: Record<string, number>;
  onChange: (key: string, value: number) => void;
}) {
  const fields = PARAM_DEFS[strategy] ?? [];
  return (
    <HStack gap={3}>
      {fields.map((f) => (
        <TextInput
          key={f.key}
          label={f.label}
          value={String(params[f.key] ?? f.defaultValue)}
          onChange={(v) => onChange(f.key, Number(v) || 0)}
          style={{ width: 120 }}
        />
      ))}
    </HStack>
  );
}

/** 单个指标卡片 */
function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <VStack
      gap={1}
      style={{
        padding: "var(--spacing-3)",
        background: "var(--color-surface-secondary)",
        borderRadius: "var(--radius-md)",
        minWidth: 140,
      }}
    >
      <Text type="supporting" size="sm">
        {label}
      </Text>
      <Text size="lg" style={{ fontWeight: 700, color }}>
        {value}
      </Text>
    </VStack>
  );
}

/** 报告头部：回测概览（直接使用 AKQuant report 数据） */
function ReportHeader({
  report,
  strategy,
}: {
  report: ReportInfo;
  strategy: string;
}) {
  const headerItems = [
    { label: "回测区间", value: `${report.startDate} ~ ${report.endDate}` },
    { label: "回测时长", value: `${report.durationDays} 天` },
    { label: "策略", value: STRATEGY_LABEL_MAP[strategy] ?? strategy },
    { label: "标的", value: report.symbol },
    { label: "初始资金", value: `${fmtMoney(report.initialCapital)} 元` },
    { label: "最终权益", value: `${fmtMoney(report.finalEquity)} 元` },
  ];

  return (
    <Card padding={5}>
      <HStack gap={6} style={{ flexWrap: "wrap" }}>
        {headerItems.map((item) => (
          <VStack key={item.label} gap={2}>
            <Text type="supporting" size="sm">
              {item.label}
            </Text>
            <Text style={{ fontWeight: 600 }}>{item.value}</Text>
          </VStack>
        ))}
      </HStack>
    </Card>
  );
}

// ==============================
// Page
// ==============================

export const Route = createFileRoute("/backtest")({
  component: BacktestPage,
});

function BacktestPage() {
  const [symbol, setSymbol] = useState("002594.SZ");
  const [strategy, setStrategy] = useState<string>("ma_cross");
  const [params, setParams] = useState<Record<string, number>>({});
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [resultTab, setResultTab] = useState("overview");

  const runBacktest = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setResult(null);

    const resolved: Record<string, number> = {};
    const defs = STRATEGY_DEFAULTS[strategy] ?? {};
    for (const [k, dv] of Object.entries(defs)) {
      resolved[k] = params[k] ?? dv;
    }

    const res = await fetch("/api/v1/backtests/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        strategy,
        params: resolved,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    });
    const json = await res.json();
    setResult(json.success ? json.data : null);
    setLoading(false);
  }, [symbol, strategy, params, startDate, endDate]);

  /** 核心指标列表（对齐 AKQuant 12 项完整指标） */
  const metricItems = useMemo(() => {
    if (!result?.metrics) return [];
    const m = result.metrics;
    const posGreen = "var(--color-text-positive)";
    const negRed = "var(--color-text-negative)";
    return [
      { label: "累计收益率", value: fmtPct(m.totalReturn), color: m.totalReturn >= 0 ? posGreen : negRed },
      { label: "年化收益率(CAGR)", value: fmtPct(m.cagr), color: m.cagr >= 0 ? posGreen : negRed },
      { label: "平均盈亏", value: fmtPct(m.avgPnl) },
      { label: "夏普比率", value: fmtNum(m.sharpeRatio) },
      { label: "索提诺比率", value: fmtNum(m.sortinoRatio) },
      { label: "卡玛比率", value: fmtNum(m.calmarRatio) },
      { label: "最大回撤", value: fmtPct(m.maxDrawdown), color: negRed },
      { label: "波动率", value: fmtPct(m.volatility) },
      { label: "胜率", value: fmtPct(m.winRate) },
      { label: "盈亏比", value: fmtNum(m.profitFactor) },
      { label: "凯利公式", value: fmtNum(m.kelly) },
      { label: "交易次数", value: String(m.totalTrades) },
    ];
  }, [result]);

  return (
    <VStack gap={6}>
      <Heading level={2}>策略回测</Heading>

      {/* 参数输入区 */}
      <Section>
        <VStack gap={4}>
          <HStack gap={3} align="end">
            <TextInput
              label="股票代码"
              placeholder="如 000001.SZ"
              value={symbol}
              onChange={setSymbol}
              style={{ width: 160 }}
            />
            <TextInput
              label="开始日期"
              placeholder="2024-01-01"
              value={startDate}
              onChange={setStartDate}
              style={{ width: 130 }}
            />
            <TextInput
              label="结束日期"
              placeholder="2026-07-29"
              value={endDate}
              onChange={setEndDate}
              style={{ width: 130 }}
            />
            <VStack gap={1}>
              <Text type="supporting" size="sm">
                策略
              </Text>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                style={{
                  height: 36,
                  padding: "0 8px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                {STRATEGY_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </VStack>
            <Button
              label={loading ? "运行中..." : "开始回测"}
              variant="primary"
              isDisabled={!symbol || loading}
              onClick={runBacktest}
            />
          </HStack>

          <ParamInputs
            strategy={strategy}
            params={params}
            onChange={(k, v) => setParams((p) => ({ ...p, [k]: v }))}
          />
        </VStack>
      </Section>

      {/* 加载状态 */}
      {loading && <Spinner size="sm" label="回测计算中，请稍候..." />}

      {/* 回测报告 */}
      {result && (
        <VStack gap={5}>
          {/* 报告头部 — 直接使用 AKQuant report */}
          <ReportHeader report={result.report} strategy={strategy} />

          {/* 核心指标 — AKQuant 12 项 */}
          <Section>
            <VStack gap={4}>
              <Text style={{ fontWeight: 600 }}>核心指标 (Key Metrics)</Text>
              <HStack gap={4} style={{ flexWrap: "wrap" }}>
                {metricItems.map((m) => (
                  <MetricCard
                    key={m.label}
                    label={m.label}
                    value={m.value}
                    color={m.color}
                  />
                ))}
              </HStack>
            </VStack>
          </Section>

          {/* 标签页：图表 / 交易记录 */}
          <TabList value={resultTab} onChange={setResultTab}>
            <Tab value="overview" label="权益与回撤" />
            <Tab value="trades_chart" label="交易盈亏分布" />
            <Tab value="trades" label={`交易记录 (${result.trades.length})`} />
          </TabList>

          {resultTab === "overview" && (
            <Card padding={4}>
              <EquityChart
                equity={result.equity}
                initialCapital={result.report.initialCapital}
              />
            </Card>
          )}

          {resultTab === "trades_chart" && (
            <Card padding={4}>
              {result.trades.length > 0 ? (
                <TradeChart trades={result.trades} />
              ) : (
                <VStack gap={4} align="center" style={{ padding: "var(--spacing-6)" }}>
                  <Text type="supporting">该回测期间未产生交易</Text>
                </VStack>
              )}
            </Card>
          )}

          {resultTab === "trades" && (
            <Table<Trade>
              idKey="entryTime"
              columns={TRADE_COLUMNS}
              data={result.trades}
              density="compact"
              dividers="rows"
              hasHover
            />
          )}
        </VStack>
      )}
    </VStack>
  );
}
