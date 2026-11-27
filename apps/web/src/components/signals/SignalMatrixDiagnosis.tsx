import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type {
  SignalLayerJudgment,
  SignalResult,
  TechnicalSignalJudgmentSummary,
} from "@ai-trader/signal-catalog/contracts";
import { AlertTriangle, ChevronDown, ExternalLink, RotateCcw, X } from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Button } from "@preline-ui/Button";
import { Heading } from "@preline-ui/Heading";
import { Skeleton } from "@preline-ui/Skeleton";
import { Text } from "@preline-ui/Text";
import { displaySignalName, SignalQualityStrip, type SignalLayer } from "./SignalDiagnosis";
import {
  formatSignalValue,
  judgmentLayer,
  judgmentVerdictMeta,
  signalStatusMeta,
} from "./signal-utils";
import { nextExpandedSignalId, selectSignalPreview } from "./signal-group-drawer";

export interface SignalMatrixDiagnosisProps {
  title: string;
  description: string;
  layers: readonly SignalLayer[];
  asOf?: string | null;
  catalogVersion?: string;
  isLoading?: boolean;
  error?: string | null;
  partialMessage?: string | null;
  onRetry?: () => void;
  judgment?: TechnicalSignalJudgmentSummary | null;
}

function SignalStatus({ signal }: { signal: SignalResult }) {
  const meta = signalStatusMeta(signal.status);
  return (
    <span
      className={`inline-flex min-h-5 shrink-0 items-center gap-1 border px-1.5 text-[11px] font-semibold ${meta.className}`}
    >
      <span className={`size-1.5 rounded-full ${meta.dotClassName}`} />
      {meta.label}
    </span>
  );
}

function MatrixCard({
  layer,
  judgment,
  buttonRef,
  onOpen,
}: {
  layer: SignalLayer;
  judgment: SignalLayerJudgment | null;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onOpen: () => void;
}) {
  const preview = selectSignalPreview(layer.signals);
  const triggered = layer.signals.filter((signal) => signal.status === "triggered").length;
  const meta = judgment ? judgmentVerdictMeta(judgment.verdict) : null;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`打开${layer.label}全部 ${layer.signals.length} 项信号`}
      className="focus-ring group flex min-h-52 w-full flex-col border border-app-line bg-app-panel p-4 text-left transition hover:border-primary/35 hover:bg-app-surface/35"
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="min-w-0">
          <strong className="block text-sm font-semibold text-app-ink">{layer.label}</strong>
          <span className="mt-1 block font-mono text-[11px] text-app-muted">
            {triggered} 已触发 / {layer.signals.length} 项
          </span>
        </span>
        {meta ? (
          <span
            className={`inline-flex min-h-5 items-center gap-1 border px-1.5 text-[11px] font-semibold ${meta.className}`}
          >
            <span className={`size-1.5 rounded-full ${meta.dotClassName}`} />
            {judgment?.verdictLabel}
          </span>
        ) : null}
      </span>

      <span className="mt-3 w-full border-y border-app-line/70 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-app-muted">
        目录预览 · 前 3 项
      </span>
      <span className="w-full">
        {preview.map((signal, index) => (
          <span
            key={signal.signalId}
            className="grid min-h-9 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 border-b border-app-line/60 text-[11px]"
          >
            <span className="font-mono text-app-faint">{String(index + 1).padStart(2, "0")}</span>
            <span className="truncate text-app-ink">
              {signal.displayName || displaySignalName(signal.signalId)}
            </span>
            <SignalStatus signal={signal} />
          </span>
        ))}
      </span>
      <span className="mt-auto flex w-full items-center justify-between gap-2 pt-3 text-[11px] font-semibold text-primary">
        查看全部 {layer.signals.length} 项
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}

function DetailField({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-app-line/60 py-3 first:border-t-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-app-muted">
        {title}
      </dt>
      <dd className="mt-1 text-[11px] leading-5 text-app-ink">{children}</dd>
    </div>
  );
}

function SignalDrawer({
  layer,
  judgment,
  asOf,
  catalogVersion,
  onClose,
}: {
  layer: SignalLayer;
  judgment: SignalLayerJudgment | null;
  asOf?: string | null;
  catalogVersion: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [expandedSignalId, setExpandedSignalId] = useState<string | null>(null);
  const meta = judgment ? judgmentVerdictMeta(judgment.verdict) : null;
  const triggered = layer.signals.filter((signal) => signal.status === "triggered").length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-app-ink/25 backdrop-blur-[1px]"
        aria-label={`关闭${layer.label}信号详情`}
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-none flex-col border-l border-app-line bg-app-panel shadow-2xl md:w-[560px] md:max-w-[calc(100vw-80px)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-app-line px-4 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold tracking-[0.1em] text-primary">
              SIGNAL MATRIX · {layer.signals.length} 项
            </p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight text-app-ink">
              {layer.label}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="focus-ring grid size-9 shrink-0 place-items-center border border-app-line text-app-muted hover:bg-app-surface hover:text-app-ink"
            aria-label={`关闭${layer.label}全部信号`}
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-app-line px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                已触发 {triggered} / {layer.signals.length}
              </span>
              {meta ? (
                <span
                  className={`inline-flex min-h-6 items-center gap-1 border px-2 text-[11px] font-semibold ${meta.className}`}
                >
                  <span className={`size-1.5 rounded-full ${meta.dotClassName}`} />
                  {judgment?.verdictLabel}
                </span>
              ) : null}
              <span className="font-mono text-[11px] text-app-muted">
                {asOf ?? layer.signals[0]?.asOf ?? "时间未标注"}
              </span>
            </div>
            {judgment ? (
              <p className="mt-3 text-[11px] leading-6 text-app-muted">{judgment.rationale}</p>
            ) : null}
          </div>

          <section className="px-4 py-4" aria-labelledby={`${titleId}-list`}>
            <h3 id={`${titleId}-list`} className="text-[11px] font-semibold text-app-ink">
              全部 {layer.signals.length} 项
            </h3>
            <div className="mt-2 border-y border-app-line">
              {layer.signals.map((signal, index) => {
                const expanded = expandedSignalId === signal.signalId;
                const detailId = `${titleId}-${index}-detail`;
                return (
                  <div
                    key={signal.signalId}
                    className="border-b border-app-line/70 last:border-b-0"
                  >
                    <button
                      type="button"
                      className="focus-ring grid min-h-14 w-full grid-cols-[24px_minmax(0,1fr)_auto_58px_14px] items-center gap-2 px-2 py-2 text-left transition hover:bg-app-surface/45"
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      onClick={() =>
                        setExpandedSignalId((current) =>
                          nextExpandedSignalId(current, signal.signalId),
                        )
                      }
                    >
                      <span className="font-mono text-[11px] text-app-faint">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-[11px] text-app-ink">
                          {signal.displayName || displaySignalName(signal.signalId)}
                        </strong>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-app-muted">
                          {formatSignalValue(signal)} · 样本 {signal.sampleCount}
                        </span>
                      </span>
                      <SignalStatus signal={signal} />
                      <span className="text-right text-[11px] text-app-muted">
                        {expanded ? "收起" : "详情"}
                      </span>
                      <ChevronDown
                        className={`size-3.5 text-app-muted transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {expanded ? (
                      <dl id={detailId} className="w-full bg-app-surface/55 px-4 pb-3">
                        <DetailField title="组成证据">
                          {signal.evidence.notes.length > 0
                            ? signal.evidence.notes.join("；")
                            : signal.evidence.components.length > 0
                              ? signal.evidence.components
                                  .map(
                                    (item) =>
                                      `${displaySignalName(item.signalId)} ${String(item.value ?? "—")}`,
                                  )
                                  .join("；")
                              : "当前没有额外组成证据。"}
                        </DetailField>
                        <DetailField title="数据边界">
                          缺失字段：
                          {signal.evidence.missingFields.join("、") || "无"}
                          <br />
                          来源：{signal.dataSources.join("、") || "未标注"} · 样本{" "}
                          {signal.sampleCount}
                          {signal.proxy ? " · 低粒度代理值" : ""}
                        </DetailField>
                        <DetailField title="版本与时间">
                          目录 {catalogVersion} · 定义 {signal.definitionHash.slice(0, 12)}
                          <br />
                          业务时间 {signal.asOf} · 计算时间 {signal.computedAt}
                        </DetailField>
                        <DetailField title="规则与参数">
                          {signal.rule || "规则说明未提供。"}
                          <br />
                          {Object.keys(signal.params).length > 0
                            ? Object.entries(signal.params)
                                .map(([key, value]) => `${key}=${String(value)}`)
                                .join(" · ")
                            : "参数未提供"}
                        </DetailField>
                        <DetailField title="确认与失效">
                          确认：{signal.confirmation || "—"}
                          <br />
                          失效：{signal.invalidation || "—"}
                        </DetailField>
                      </dl>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="border-t border-app-line px-4 py-4 text-[11px] leading-5 text-app-muted">
            <p>
              矩阵卡前三项按信号目录固定顺序展示，只作为预览，不按实时强弱排序；完整项和状态以本抽屉为准。
            </p>
            <p className="mt-2">信号是研究证据，不构成买卖建议；缺失或低置信数据不会补为零值。</p>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function SignalMatrixDiagnosis({
  title,
  description,
  layers,
  asOf,
  catalogVersion = "technical-signals-1.0.0",
  isLoading = false,
  error = null,
  partialMessage = null,
  onRetry,
  judgment = null,
}: SignalMatrixDiagnosisProps) {
  const [activeLayerKey, setActiveLayerKey] = useState<string | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeLayer = layers.find((layer) => layer.key === activeLayerKey) ?? null;
  const allSignals = useMemo(() => layers.flatMap((layer) => layer.signals), [layers]);
  const counts = useMemo(
    () =>
      allSignals.reduce(
        (result, signal) => {
          result[signal.status] += 1;
          return result;
        },
        {
          triggered: 0,
          neutral: 0,
          invalidated: 0,
          "low-confidence": 0,
          unavailable: 0,
          "not-applicable": 0,
        },
      ),
    [allSignals],
  );

  const closeDrawer = useCallback(() => {
    const triggerKey = activeLayerKey;
    setActiveLayerKey(null);
    if (triggerKey) requestAnimationFrame(() => triggerRefs.current.get(triggerKey)?.focus());
  }, [activeLayerKey]);

  return (
    <section className="border-y border-app-line bg-app-panel" aria-label={title}>
      <div className="flex flex-col gap-3 border-b border-app-line px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={2}>{title}</Heading>
            <Badge variant="neutral">{catalogVersion}</Badge>
          </div>
          <Text as="p" type="supporting" className="mt-1 text-xs leading-5">
            {description}
          </Text>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 font-mono text-[11px] text-app-muted">
          <span className="border border-app-line bg-app-surface px-2 py-1">
            as-of {asOf ?? "—"}
          </span>
          <span className="border border-app-line bg-app-surface px-2 py-1">
            {allSignals.length} 项
          </span>
        </div>
      </div>

      <div className="px-4 pt-3">
        <SignalQualityStrip counts={counts} total={allSignals.length} />
      </div>

      {partialMessage ? (
        <div
          className="mx-4 mt-3 flex items-start gap-2 border border-app-warning/35 bg-app-warning/10 px-3 py-2 text-[11px] leading-5 text-app-ink"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-app-warning" />
          <span>{partialMessage}</span>
        </div>
      ) : null}

      {error ? (
        <div className="px-4 py-8 text-center">
          <strong className="text-sm text-app-ink">信号快照暂时不可用</strong>
          <p className="mt-1 text-[11px] text-app-muted">{error}</p>
          {onRetry ? (
            <Button
              className="mt-3"
              variant="secondary"
              size="sm"
              label="重试信号区域"
              icon={<RotateCcw className="size-3.5" />}
              onClick={onRetry}
            />
          ) : null}
        </div>
      ) : isLoading ? (
        <div className="grid gap-2 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
          {layers.map((layer) => (
            <Skeleton key={layer.key} height={208} width="100%" />
          ))}
        </div>
      ) : layers.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <strong className="text-sm text-app-ink">当前对象暂无技术信号</strong>
          <p className="mt-1 text-[11px] text-app-muted">
            信号目录为空或业务日期没有可用快照，不使用中性值填补。
          </p>
        </div>
      ) : (
        <div className="grid gap-2 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
          {layers.map((layer) => (
            <MatrixCard
              key={layer.key}
              layer={layer}
              judgment={judgmentLayer(judgment, layer.key)}
              buttonRef={(node) => {
                if (node) triggerRefs.current.set(layer.key, node);
                else triggerRefs.current.delete(layer.key);
              }}
              onOpen={() => setActiveLayerKey(layer.key)}
            />
          ))}
        </div>
      )}

      {activeLayer ? (
        <SignalDrawer
          layer={activeLayer}
          judgment={judgmentLayer(judgment, activeLayer.key)}
          asOf={asOf}
          catalogVersion={catalogVersion}
          onClose={closeDrawer}
        />
      ) : null}
    </section>
  );
}
