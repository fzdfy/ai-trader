import { useState, useCallback } from "react";
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

interface BacktestMetrics {
  totalReturn: number;
  annualReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  avgPnlPct: number;
}

type Trade = Record<string, unknown> & {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
};

interface BacktestResult {
  metrics: BacktestMetrics;
  equity: { time: string; value: number }[];
  trades: Trade[];
}

const STRATEGY_OPTIONS = [
  { value: "maCross", label: "MA 双均线交叉" },
  { value: "rsi", label: "RSI 超买超卖" },
  { value: "macd", label: "MACD 信号交叉" },
  { value: "bollinger", label: "布林带突破" },
] as const;

const TRADE_COLUMNS = [
  { key: "entryTime" as const, header: "买入日", width: proportional(1.5) },
  { key: "exitTime" as const, header: "卖出日", width: proportional(1.5) },
  { key: "entryPrice" as const, header: "买入价", width: proportional(1) },
  { key: "exitPrice" as const, header: "卖出价", width: proportional(1) },
  {
    key: "pnlPct" as const,
    header: "收益率",
    width: proportional(1),
    renderCell: (row: Trade) => {
      const color = row.pnlPct > 0 ? "var(--color-text-positive)" : "var(--color-text-negative)";
      return <Text style={{ color }}>{((row.pnlPct as number) * 100).toFixed(2)}%</Text>;
    },
  },
];

const STRATEGY_DEFAULTS: Record<string, Record<string, number>> = {
  maCross: { fast: 5, slow: 20 },
  rsi: { period: 14, oversold: 30, overbought: 70 },
  macd: { fast: 12, slow: 26, signal: 9 },
  bollinger: { period: 20, multiplier: 2 },
};

const PARAM_DEFS: Record<string, { key: string; label: string; defaultValue: number }[]> = {
  maCross: [
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

function ParamInputs({ strategy, params, onChange }: {
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

export const Route = createFileRoute("/backtest")({
  component: BacktestPage,
});

function BacktestPage() {
  const [symbol, setSymbol] = useState("");
  const [strategy, setStrategy] = useState<string>("maCross");
  const [params, setParams] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [tab, setTab] = useState("metrics");

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
      body: JSON.stringify({ symbol, strategy: { type: strategy, params: resolved } }),
    });
    const json = await res.json();
    setResult(json.success ? json.data : null);
    setLoading(false);
  }, [symbol, strategy, params]);

  return (
    <VStack gap={6}>
      <Heading level={2}>策略回测</Heading>

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
            <VStack gap={1}>
              <Text type="supporting" size="sm">策略</Text>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                style={{ height: 36, padding: "0 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}
              >
                {STRATEGY_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
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

          <ParamInputs strategy={strategy} params={params} onChange={(k, v) => setParams((p) => ({ ...p, [k]: v }))} />
        </VStack>
      </Section>

      {loading && <Spinner size="sm" label="回测计算中..." />}

      {result && (
        <Section>
          <VStack gap={4}>
            <TabList value={tab} onChange={setTab}>
              <Tab value="metrics" label="指标" />
              <Tab value="trades" label={`交易记录 (${result.trades.length})`} />
            </TabList>

            {tab === "metrics" && (
              <HStack gap={4}>
                {[
                  { label: "总收益率", value: `${result.metrics.totalReturn}%`, c: result.metrics.totalReturn > 0 ? "positive" as const : "negative" as const },
                  { label: "年化收益", value: `${result.metrics.annualReturn}%`, c: undefined },
                  { label: "最大回撤", value: `${result.metrics.maxDrawdown}%`, c: undefined },
                  { label: "夏普比率", value: String(result.metrics.sharpeRatio), c: undefined },
                  { label: "胜率", value: `${result.metrics.winRate}%`, c: undefined },
                  { label: "交易次数", value: String(result.metrics.totalTrades), c: undefined },
                  { label: "平均盈亏", value: `${result.metrics.avgPnlPct}%`, c: undefined },
                ].map((m) => (
                  <VStack key={m.label} gap={1} style={{ padding: "var(--spacing-3)", background: "var(--color-surface-secondary)", borderRadius: "var(--radius-md)", minWidth: 120 }}>
                    <Text type="supporting" size="sm">{m.label}</Text>
                    <Text size="lg" style={{ fontWeight: 600, color: (() => { if (m.c === "positive") return "var(--color-text-positive)"; if (m.c === "negative") return "var(--color-text-negative)"; return ""; })() }}>
                      {m.value}
                    </Text>
                  </VStack>
                ))}
              </HStack>
            )}

            {tab === "trades" && (
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
        </Section>
      )}
    </VStack>
  );
}
