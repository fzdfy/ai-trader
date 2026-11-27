import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type {
  SignalLayerJudgment,
  SignalResult,
  SignalStatus,
  TechnicalSignalJudgmentSummary,
} from "@ai-trader/signal-catalog/contracts";
import { AlertTriangle, ChevronDown, RotateCcw } from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { EmptyState } from "@preline-ui/EmptyState";
import { Heading } from "@preline-ui/Heading";
import { Skeleton } from "@preline-ui/Skeleton";
import { Text } from "@preline-ui/Text";
import {
  SIGNAL_FILTERS,
  filterSignals,
  formatSignalValue,
  judgmentConfidenceLabel,
  judgmentLayer,
  judgmentVerdictMeta,
  signalCounts,
  signalStatusMeta,
  type SignalFilter,
} from "./signal-utils";

export interface SignalLayer {
  key: string;
  label: string;
  signals: readonly SignalResult[];
}

export interface SignalDiagnosisProps {
  title: string;
  description: string;
  layers: readonly SignalLayer[];
  asOf?: string | null;
  catalogVersion?: string;
  isLoading?: boolean;
  error?: string | null;
  partialMessage?: string | null;
  defaultLayer?: string;
  onRetry?: () => void;
  judgment?: TechnicalSignalJudgmentSummary | null;
}

function StatusBadge({ signal }: { signal: SignalResult }) {
  const meta = signalStatusMeta(signal.status);
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}
    >
      <span className={`size-1.5 rounded-full ${meta.dotClassName}`} />
      {meta.label}
    </span>
  );
}

export function SignalQualityStrip({
  counts,
  total,
}: {
  counts: Record<SignalStatus, number>;
  total: number;
}) {
  const usable = total - counts.unavailable - counts["not-applicable"];
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-app-surface px-3 py-2 text-[11px] text-app-muted"
      aria-label="技术信号数据质量"
    >
      <span>
        可用{" "}
        <strong className="font-mono text-app-ink">
          {usable}/{total}
        </strong>
      </span>
      <span>
        已触发 <strong className="font-mono text-app-ink">{counts.triggered}</strong>
      </span>
      <span>
        低置信 <strong className="font-mono text-app-ink">{counts["low-confidence"]}</strong>
      </span>
      <span>
        待接入 <strong className="font-mono text-app-ink">{counts.unavailable}</strong>
      </span>
      <span>
        不适用 <strong className="font-mono text-app-ink">{counts["not-applicable"]}</strong>
      </span>
    </div>
  );
}

function JudgmentCounts({ judgment }: { judgment: SignalLayerJudgment }) {
  const { counts } = judgment;
  return (
    <div className="flex flex-wrap justify-end gap-1.5 text-[10px] text-app-muted">
      <span className="rounded-full bg-app-panel px-2 py-1">
        {counts.bullish} 多 / {counts.bearish} 空 / {counts.neutral} 中性
      </span>
      <span className="rounded-full bg-app-panel px-2 py-1">{counts.total} 项本层</span>
      <span className="rounded-full bg-app-panel px-2 py-1">
        覆盖 {Math.round(counts.coverage * 100)}%
      </span>
    </div>
  );
}

function LayerJudgment({ judgment }: { judgment: SignalLayerJudgment }) {
  const meta = judgmentVerdictMeta(judgment.verdict);
  return (
    <section
      className="border-b border-app-line bg-app-panel px-4 py-3 sm:px-5"
      aria-label={`${judgment.label}判断`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-xs text-app-ink">
              {judgment.label}判断 · {judgment.verdictLabel}
            </strong>
            <span
              className={`inline-flex min-h-5 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold ${meta.className}`}
            >
              <span className={`size-1.5 rounded-full ${meta.dotClassName}`} />
              {judgment.verdictLabel}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-app-muted">{judgment.rationale}</p>
        </div>
        <JudgmentCounts judgment={judgment} />
      </div>
    </section>
  );
}

function OverallJudgment({
  judgment,
  layers,
  onJump,
}: {
  judgment: TechnicalSignalJudgmentSummary;
  layers: readonly SignalLayer[];
  onJump: (layer: string) => void;
}) {
  const meta = judgmentVerdictMeta(judgment.overall.verdict);
  return (
    <section
      className="border-b border-app-line bg-app-surface/45 px-4 py-4 sm:px-5"
      aria-label="对象总判断"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.72fr)]">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold tracking-[0.1em] text-primary">
            对象总判断 · 主层共识
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${meta.className}`}
            >
              <span className={`size-1.5 rounded-full ${meta.dotClassName}`} />
              {judgment.overall.verdictLabel}
            </span>
            <h4 className="text-lg font-semibold tracking-tight text-app-ink sm:text-xl">
              {judgment.overall.headline}
            </h4>
          </div>
          <p className="mt-2 text-[11px] leading-6 text-app-muted">{judgment.overall.rationale}</p>
          <p className="mt-1 font-mono text-[9px] text-app-faint">
            {judgment.summaryVersion} · 置信度{" "}
            {judgmentConfidenceLabel(judgment.overall.confidence)}
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          {judgment.layers.map((layer) => {
            const layerMeta = judgmentVerdictMeta(layer.verdict);
            const available = layers.some((item) => item.key === layer.layer);
            return (
              <button
                key={layer.layer}
                type="button"
                disabled={!available}
                onClick={() => onJump(layer.layer)}
                className="focus-ring grid min-h-10 grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-app-panel px-2.5 text-left transition hover:bg-app-panel/75 disabled:cursor-default"
                aria-label={`查看${layer.label}判断`}
              >
                <strong className="text-[11px] text-app-ink">{layer.label}</strong>
                <span className="truncate text-[10px] text-app-muted">{layer.rationale}</span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold ${layerMeta.className.split(" ").at(-1)}`}
                >
                  <span className={`size-1 rounded-full ${layerMeta.dotClassName}`} />
                  {layer.verdictLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function SignalDiagnosis({
  title,
  description,
  layers,
  asOf,
  catalogVersion = "technical-signals-1.0.0",
  isLoading = false,
  error = null,
  partialMessage = null,
  defaultLayer,
  onRetry,
  judgment = null,
}: SignalDiagnosisProps) {
  const id = useId();
  const [activeLayer, setActiveLayer] = useState(defaultLayer ?? layers[0]?.key ?? "");
  const [filter, setFilter] = useState<SignalFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const selectedLayer = layers.find((layer) => layer.key === activeLayer) ?? layers[0];
  const selectedSignals = useMemo(
    () => filterSignals(selectedLayer?.signals ?? [], filter),
    [filter, selectedLayer],
  );
  const allSignals = useMemo(() => layers.flatMap((layer) => layer.signals), [layers]);
  const counts = useMemo(() => signalCounts(allSignals), [allSignals]);
  const selectedJudgment = judgmentLayer(judgment, selectedLayer?.key ?? "");

  const changeLayer = (key: string) => {
    setActiveLayer(key);
    setFilter("all");
    setExpanded(new Set());
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (layers.length < 2) return;
    const current = layers.findIndex((layer) => layer.key === activeLayer);
    const next =
      event.key === "ArrowRight"
        ? (current + 1) % layers.length
        : event.key === "ArrowLeft"
          ? (current - 1 + layers.length) % layers.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? layers.length - 1
              : null;
    if (next == null) return;
    event.preventDefault();
    changeLayer(layers[next]!.key);
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[next]?.focus();
  };

  const toggleExpanded = (signalId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(signalId)) next.delete(signalId);
      else next.add(signalId);
      return next;
    });
  };

  return (
    <Card className="overflow-hidden bg-app-panel" aria-label={title}>
      <div className="flex flex-col gap-4 border-b border-app-line px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={3}>{title}</Heading>
            <Badge variant="neutral">{catalogVersion}</Badge>
          </div>
          <Text type="supporting" as="p" className="mt-1 text-xs leading-5">
            {description}
          </Text>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-app-muted">
          <span className="rounded-full border border-app-line bg-app-surface px-2.5 py-1">
            as-of {asOf ?? "—"}
          </span>
          <span className="rounded-full border border-app-line bg-app-surface px-2.5 py-1">
            {allSignals.length} 项
          </span>
        </div>
      </div>

      {judgment && !isLoading && !error ? (
        <OverallJudgment judgment={judgment} layers={layers} onJump={changeLayer} />
      ) : null}

      <SignalQualityStrip counts={counts} total={allSignals.length} />

      {partialMessage ? (
        <div
          className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-app-warning/35 bg-app-warning/10 px-3 py-2 text-xs text-app-ink sm:mx-5"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{partialMessage}</span>
        </div>
      ) : null}

      {error ? (
        <div>
          <EmptyState title="信号快照暂时不可用" description={error} />
          {onRetry ? (
            <div className="-mt-6 pb-8 text-center">
              <Button
                variant="secondary"
                size="sm"
                label="重试信号区域"
                icon={<RotateCcw className="size-3.5" />}
                onClick={onRetry}
              />
            </div>
          ) : null}
        </div>
      ) : isLoading ? (
        <div className="space-y-2 p-4 sm:p-5" aria-label="技术信号加载中">
          <Skeleton height={40} width="100%" />
          <Skeleton height={40} width="100%" />
          <Skeleton height={40} width="100%" />
        </div>
      ) : allSignals.length === 0 ? (
        <div>
          <EmptyState
            title="当前对象暂无技术信号"
            description="信号目录为空或业务日期没有可用快照，不使用中性值填补。"
          />
          {onRetry ? (
            <div className="-mt-6 pb-8 text-center">
              <Button variant="secondary" size="sm" label="重试" onClick={onRetry} />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-app-line px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label={`${title}层级`}>
              {layers.map((layer) => {
                const selected = selectedLayer?.key === layer.key;
                return (
                  <button
                    key={layer.key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`${id}-${layer.key}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => changeLayer(layer.key)}
                    onKeyDown={onTabKeyDown}
                    className={`focus-ring inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition ${
                      selected
                        ? "bg-primary/10 text-primary shadow-[inset_0_-2px_0_var(--color-primary)]"
                        : "text-app-muted hover:bg-app-surface hover:text-app-ink"
                    }`}
                  >
                    {layer.label}
                    <span className="font-mono text-[10px]">{layer.signals.length}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1 overflow-x-auto" aria-label="信号状态筛选">
              {SIGNAL_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={`focus-ring min-h-8 shrink-0 rounded-md px-2.5 text-[11px] font-medium transition ${
                    filter === item.value
                      ? "bg-app-ink text-app-panel"
                      : "border border-app-line bg-app-panel text-app-muted hover:text-app-ink"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div id={`${id}-${selectedLayer?.key ?? "empty"}`} role="tabpanel" className="min-w-0">
            {selectedJudgment ? <LayerJudgment judgment={selectedJudgment} /> : null}
            <Text
              as="p"
              type="supporting"
              className="px-4 pt-3 text-[11px] sm:px-5"
              aria-live="polite"
            >
              当前层显示 {selectedSignals.length} / {selectedLayer?.signals.length ?? 0} 项
            </Text>
            {selectedSignals.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-app-muted sm:px-5">
                当前筛选下没有信号，清除筛选可恢复完整分组。
              </div>
            ) : (
              <div
                className="overflow-x-auto"
                role="region"
                aria-label={`${title}信号列表，可横向滚动`}
                tabIndex={0}
              >
                <table className="w-full table-fixed border-collapse text-left sm:min-w-[680px] sm:table-auto">
                  <thead>
                    <tr className="border-b border-app-line text-[10px] font-semibold uppercase tracking-[0.08em] text-app-muted">
                      <th className="w-[40%] px-3 py-2.5 sm:w-[27%] sm:px-5">信号</th>
                      <th className="w-[23%] px-2 py-2.5 sm:w-[13%] sm:px-3">状态</th>
                      <th className="w-[27%] px-2 py-2.5 sm:w-[16%] sm:px-3">当前值</th>
                      <th className="hidden w-[38%] px-3 py-2.5 sm:table-cell">证据</th>
                      <th className="w-[10%] px-2 py-2.5 sm:w-[6%] sm:px-3">
                        <span className="sr-only">展开证据</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSignals.map((signal) => {
                      const isExpanded = expanded.has(signal.signalId);
                      const detailId = `${id}-${signal.signalId}`;
                      return (
                        <SignalRows
                          key={signal.signalId}
                          signal={signal}
                          detailId={detailId}
                          expanded={isExpanded}
                          onToggle={() => toggleExpanded(signal.signalId)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function SignalRows({
  signal,
  detailId,
  expanded,
  onToggle,
}: {
  signal: SignalResult;
  detailId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-app-line/80 align-top hover:bg-app-surface/60">
        <td className="px-3 py-3 sm:px-5">
          <strong className="block text-xs font-semibold text-app-ink">
            {signal.displayName ?? displaySignalName(signal.signalId)}
          </strong>
          <span className="mt-0.5 block font-mono text-[9px] text-app-muted">
            {signal.signalId}
          </span>
        </td>
        <td className="px-2 py-3 sm:px-3">
          <StatusBadge signal={signal} />
        </td>
        <td className="px-2 py-3 font-mono text-xs font-semibold tabular-nums text-app-ink sm:px-3">
          {formatSignalValue(signal)}
        </td>
        <td className="hidden px-3 py-3 text-[11px] leading-5 text-app-muted sm:table-cell">
          {signal.evidence.notes[0] ?? signalEvidenceFallback(signal)}
        </td>
        <td className="px-2 py-3 text-right sm:px-3">
          <button
            type="button"
            className="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-app-line text-app-muted hover:text-app-ink"
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={`${expanded ? "收起" : "展开"}${displaySignalName(signal.signalId)}证据`}
            onClick={onToggle}
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr id={detailId} className="border-b border-app-line bg-app-surface/70">
          <td colSpan={5} className="px-4 py-4 sm:px-5">
            <div className="grid gap-4 text-[11px] leading-5 md:grid-cols-3">
              <EvidenceBlock title="组成证据">
                {signal.evidence.notes.length > 0
                  ? signal.evidence.notes.join("；")
                  : "当前没有额外组成证据。"}
              </EvidenceBlock>
              <EvidenceBlock title="数据边界">
                {signal.evidence.missingFields.length > 0
                  ? `缺失：${signal.evidence.missingFields.join("、")}`
                  : signal.proxy
                    ? "当前为低粒度代理值，不可视为高置信结论。"
                    : `样本 ${signal.sampleCount}，来源 ${signal.dataSources.join("、") || "未标注"}`}
              </EvidenceBlock>
              <EvidenceBlock title="版本与时间">
                {signal.catalogVersion} · 定义 {signal.definitionHash.slice(0, 12)}
                <br />
                业务时间 {signal.asOf} · 计算时间 {signal.computedAt}
              </EvidenceBlock>
              {signal.rule ? (
                <EvidenceBlock title="规则与参数">
                  {signal.rule}
                  <br />
                  {signal.params
                    ? Object.entries(signal.params)
                        .map(([key, value]) => `${key}=${String(value)}`)
                        .join(" · ")
                    : "参数未提供"}
                </EvidenceBlock>
              ) : null}
              {signal.confirmation || signal.invalidation ? (
                <EvidenceBlock title="确认与失效">
                  确认：{signal.confirmation ?? "—"}
                  <br />
                  失效：{signal.invalidation ?? "—"}
                </EvidenceBlock>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function EvidenceBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-app-muted">
        {title}
      </h4>
      <p className="text-app-muted">{children}</p>
    </section>
  );
}

const SIGNAL_LABELS: Record<string, string> = {
  price_vs_ma200: "价格相对 MA200",
  ma200_slope_20: "MA200 斜率",
  macd_zero_axis: "MACD 零轴状态",
  macd_divergence: "MACD 背离",
  rsi_state: "RSI 超买超卖与背离",
  bollinger_regime: "布林带压缩扩张",
  rvol: "相对成交量 RVOL",
  adx_di: "ADX / DI 趋势强度",
  obv_trend: "OBV 趋势",
  atr_regime: "ATR 波动率状态",
  range_accumulation: "震荡待涨",
  volume_contraction_base: "缩量筑底",
  golden_cross: "黄金交叉",
  bullish_alignment: "多头排列",
  base_breakout: "底部起涨",
  platform_breakout: "平台突破",
  pullback_confirmation: "回踩确认",
  acceleration: "主升加速",
  high_level_stall: "高位滞涨",
  top_reversal: "顶部反转",
  death_cross: "死亡交叉",
  bearish_breakdown: "空头破位",
};

export const displaySignalName = (signalId: string): string =>
  SIGNAL_LABELS[signalId.split(".").at(-1) ?? ""] ?? signalId.split(".").at(-1) ?? signalId;

const signalEvidenceFallback = (signal: SignalResult): string => {
  if (signal.status === "unavailable") return "所需数据尚未接入或历史不足";
  if (signal.status === "not-applicable") return "当前资产不支持该信号";
  if (signal.status === "low-confidence") return "样本或覆盖不足，仅作研究参考";
  return "查看展开证据与数据边界";
};
