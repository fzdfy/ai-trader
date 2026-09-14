import { useState, useCallback, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, proportional } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { EquityChart } from "../../components/charts/EquityChart";
import { TradeChart } from "../../components/charts/TradeChart";
import {
  useStrategiesQuery,
  type StrategyConfig,
} from "../../hooks/useStrategies";

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

const STRATEGY_LABEL_MAP: Record<string, string> = {
  ...Object.fromEntries(STRATEGY_OPTIONS.map((s) => [s.value, s.label])),
};

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
// Helper: 保存的自定义策略 configJson → quant composite 运行配置
// ==============================

/**
 * 将保存的自定义策略 configJson（百分比 0-100）转换为 quant composite 引擎
 * 所需的 0-1 小数配置。策略库中 weight/value/entry/exit/risk/position 均以
 * 百分比存储，而 quant build_composite_strategy 期望 0-1 小数，此处统一 /100。
 * cost 层（万分比/元）与枚举、布尔、整数类字段保持原值。
 */
function toRunConfig(config: StrategyConfig): Record<string, unknown> {
  const pct = (v: number | undefined, def = 0): number =>
    typeof v === "number" ? v / 100 : def;

  return {
    factors: (config.factors ?? []).map((f) => ({
      name: f.name,
      weight: pct(f.weight),
      value: pct(f.value, 0.5),
      direction: f.direction ?? 1,
    })),
    combine: config.combine ?? "weighted_sum",
    entry: config.entry
      ? {
          type: config.entry.type ?? "threshold",
          value: pct(config.entry.value),
          volumeConfirm: !!config.entry.volumeConfirm,
          limitFilter: !!config.entry.limitFilter,
          stFilter: !!config.entry.stFilter,
          marketFilter: !!config.entry.marketFilter,
        }
      : undefined,
    exit: config.exit
      ? {
          type: config.exit.type ?? "threshold",
          value: pct(config.exit.value),
          maxHoldingDays: config.exit.maxHoldingDays ?? 0,
        }
      : undefined,
    risk: config.risk
      ? {
          positionSize: pct(config.risk.positionSize),
          stopLoss: pct(config.risk.stopLoss),
          takeProfit: pct(config.risk.takeProfit),
          stopType: config.risk.stopType ?? "fixed",
          trailingStop: pct(config.risk.trailingStop),
          atrStopMultiple: config.risk.atrStopMultiple ?? 2,
          takeType: config.risk.takeType ?? "fixed",
          trailingTake: pct(config.risk.trailingTake),
          maxLossPerTrade: pct(config.risk.maxLossPerTrade),
          maxConsecutiveLosses: config.risk.maxConsecutiveLosses ?? 0,
        }
      : undefined,
    position: config.position
      ? {
          sizing: config.position.sizing ?? "fixed",
          baseSize: pct(config.position.baseSize),
          maxSize: pct(config.position.maxSize),
          totalCap: pct(config.position.totalCap),
          maxPositions: config.position.maxPositions ?? 1,
          kellyFraction: pct(config.position.kellyFraction),
          atrPeriod: config.position.atrPeriod ?? 14,
          atrRiskBudget: pct(config.position.atrRiskBudget),
          pyramiding: !!config.position.pyramiding,
          firstEntry: pct(config.position.firstEntry),
          addOnProfit: pct(config.position.addOnProfit),
          addSize: pct(config.position.addSize),
          maxAdds: config.position.maxAdds ?? 2,
          partialExit: !!config.position.partialExit,
          partialExitRatio: pct(config.position.partialExitRatio),
        }
      : undefined,
    cost: config.cost ?? undefined,
  };
}

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
          value={
            typeof params[f.key] === "number" && Number.isFinite(params[f.key])
              ? String(params[f.key])
              : String(f.defaultValue)
          }
          onChange={(v) => onChange(f.key, v.trim() === "" ? NaN : Number(v))}
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

export const Route = createFileRoute("/home/backtest")({
  component: BacktestPage,
});

function BacktestPage() {
  const [symbol, setSymbol] = useState("002594.SZ");
  const [strategy, setStrategy] = useState<string>("ma_cross");
  const [params, setParams] = useState<Record<string, number>>({});
  const [startDate, setStartDate] = useState<ISODateString | undefined>("2024-01-01");
  const [endDate, setEndDate] = useState<ISODateString | undefined>("2026-07-29");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [resultTab, setResultTab] = useState("overview");

  // 已保存的自定义策略（并入「预设策略」下拉中的「自定义策略」分组）
  const { data: savedStrategies = [] } = useStrategiesQuery();
  const selectedCustomStrategy = useMemo(() => {
    if (!strategy.startsWith("custom:")) return null;
    const id = Number(strategy.slice("custom:".length));
    return savedStrategies.find((s) => s.id === id) ?? null;
  }, [strategy, savedStrategies]);

  const runBacktest = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setResult(null);

    let body: Record<string, unknown>;

    if (selectedCustomStrategy) {
      // 已保存的自定义策略：以 composite + 转换后的 configJson 运行
      body = {
        symbol,
        strategy: "composite",
        config: toRunConfig(selectedCustomStrategy.configJson),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };
    } else {
      const resolved: Record<string, number> = {};
      const defs = STRATEGY_DEFAULTS[strategy] ?? {};
      for (const [k, dv] of Object.entries(defs)) {
        const v = params[k];
        resolved[k] = typeof v === "number" && Number.isFinite(v) ? v : dv;
      }
      body = {
        symbol,
        strategy,
        params: resolved,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };
    }

    const res = await fetch("/api/v1/backtests/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setResult(json.success ? json.data : null);
    setLoading(false);
  }, [
    symbol,
    strategy,
    selectedCustomStrategy,
    params,
    startDate,
    endDate,
  ]);

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
              value={symbol}
              onChange={setSymbol}
              style={{ width: 160 }}
            />
            <DateInput
              label="开始日期"
              value={startDate}
              onChange={setStartDate}
              placeholder=""
              style={{ width: 140 }}
            />
            <DateInput
              label="结束日期"
              value={endDate}
              onChange={setEndDate}
              placeholder=""
              style={{ width: 140 }}
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
                <optgroup label="预设策略">
                  {STRATEGY_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </optgroup>
                {savedStrategies.length > 0 && (
                  <optgroup label="自定义策略">
                    {savedStrategies.map((s) => (
                      <option key={s.id} value={`custom:${s.id}`}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </VStack>
            <Button
              label={loading ? "运行中..." : "开始回测"}
              variant="primary"
              isDisabled={!symbol || loading}
              onClick={runBacktest}
            />
          </HStack>

          {!selectedCustomStrategy && (
            <ParamInputs
              strategy={strategy}
              params={params}
              onChange={(k, v) => setParams((p) => ({ ...p, [k]: v }))}
            />
          )}
        </VStack>
      </Section>

      {/* 加载状态 */}
      {loading && <Spinner size="sm" label="回测计算中，请稍候..." />}

      {/* 回测报告 */}
      {result && (
        <VStack gap={5}>
          {/* 报告头部 — 直接使用 AKQuant report */}
          <ReportHeader
            report={result.report}
            strategy={selectedCustomStrategy?.name ?? strategy}
          />

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
