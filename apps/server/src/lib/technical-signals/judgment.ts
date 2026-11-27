import {
  SIGNAL_JUDGMENT_VERSION,
  type SignalCoreLayer,
  type SignalJudgmentConfidence,
  type SignalJudgmentCounts,
  type SignalJudgmentVerdict,
  type SignalLayerJudgment,
  type SignalLayerName,
  type SignalResult,
  type SignalStatusCounts,
  type TechnicalSignalJudgmentSummary,
} from "../../../../../packages/signal-catalog/src/contracts.ts";

const LAYER_ORDER: SignalLayerName[] = ["basic", "pattern", "advanced", "micro"];
const CORE_LAYERS: SignalCoreLayer[] = ["basic", "pattern", "advanced"];

const LAYER_LABELS: Record<SignalLayerName, string> = {
  basic: "基础信号",
  pattern: "K 线形态",
  advanced: "高级模型",
  micro: "微观结构（辅助）",
};

const DIRECTION_LABELS: Record<SignalJudgmentVerdict, string> = {
  bullish: "偏多",
  bearish: "偏空",
  neutral: "中性",
  mixed: "分歧",
  insufficient: "证据不足",
};

const OVERALL_LABELS: Record<SignalJudgmentVerdict, string> = {
  bullish: "偏强",
  bearish: "偏弱",
  neutral: "中性",
  mixed: "分歧",
  insufficient: "证据不足",
};

const HEADLINES: Record<SignalJudgmentVerdict, string> = {
  bullish: "核心层偏强，等待更多层级确认",
  bearish: "核心层偏弱，等待反向证据",
  neutral: "核心层中性，等待方向确认",
  mixed: "核心层证据分歧，维持观察",
  insufficient: "核心层证据不足，不下方向结论",
};

const layerFromSignalId = (signalId: string): SignalLayerName => {
  const layer = signalId.split(".")[0];
  if (!LAYER_ORDER.includes(layer as SignalLayerName)) {
    throw new Error(`invalid signal layer in ${signalId}`);
  }
  return layer as SignalLayerName;
};

const countStatuses = (signals: readonly SignalResult[]): SignalStatusCounts =>
  Object.fromEntries(
    ["triggered", "neutral", "invalidated", "low-confidence", "unavailable", "not-applicable"].map(
      (status) => [status, signals.filter((signal) => signal.status === status).length],
    ),
  ) as SignalStatusCounts;

const emptyJudgmentCounts = (): SignalJudgmentCounts => ({
  total: 0,
  bullish: 0,
  bearish: 0,
  neutral: 0,
  lowConfidence: 0,
  unavailable: 0,
  notApplicable: 0,
  usable: 0,
  coverage: 0,
});

const countLayer = (signals: readonly SignalResult[]): SignalJudgmentCounts => {
  const counts = emptyJudgmentCounts();
  counts.total = signals.length;
  for (const signal of signals) {
    if (signal.status === "low-confidence" || signal.quality === "low") {
      counts.lowConfidence += 1;
      continue;
    }
    if (signal.status === "unavailable") {
      counts.unavailable += 1;
      continue;
    }
    if (signal.status === "not-applicable") {
      counts.notApplicable += 1;
      continue;
    }
    if (
      (signal.status === "triggered" || signal.status === "invalidated") &&
      signal.direction === "bullish"
    ) {
      counts.bullish += 1;
      continue;
    }
    if (
      (signal.status === "triggered" || signal.status === "invalidated") &&
      (signal.direction === "bearish" || signal.direction === "risk")
    ) {
      counts.bearish += 1;
      continue;
    }
    counts.neutral += 1;
  }
  counts.usable = counts.bullish + counts.bearish + counts.neutral;
  counts.coverage = counts.total === 0 ? 0 : counts.usable / counts.total;
  return counts;
};

const layerVerdict = (counts: SignalJudgmentCounts): SignalJudgmentVerdict => {
  if (counts.total === 0 || counts.usable === 0 || counts.coverage < 1 / 3) {
    return "insufficient";
  }
  const directional = counts.bullish + counts.bearish;
  if (directional === 0) return "neutral";
  if (counts.bullish === counts.bearish) return "mixed";
  if (counts.coverage < 0.7 && counts.bullish > 0 && counts.bearish > 0) return "mixed";
  return counts.bullish > counts.bearish ? "bullish" : "bearish";
};

const layerConfidence = (
  verdict: SignalJudgmentVerdict,
  counts: SignalJudgmentCounts,
): SignalJudgmentConfidence => {
  if (verdict === "insufficient") return "insufficient";
  const directional = counts.bullish + counts.bearish;
  const majority = directional === 0 ? 0 : Math.max(counts.bullish, counts.bearish) / directional;
  if (directional >= 5 && counts.coverage >= 0.8 && majority >= 0.7) return "high";
  if (directional >= 3 && counts.coverage >= 0.6) return "medium";
  return "low";
};

const layerRationale = (counts: SignalJudgmentCounts): string =>
  [
    `${counts.bullish} 多 / ${counts.bearish} 空 / ${counts.neutral} 中性`,
    counts.lowConfidence > 0 ? `${counts.lowConfidence} 项低置信` : "",
    counts.unavailable > 0 ? `${counts.unavailable} 项不可用` : "",
    counts.notApplicable > 0 ? `${counts.notApplicable} 项不适用` : "",
    `覆盖率 ${(counts.coverage * 100).toFixed(0)}%`,
  ]
    .filter(Boolean)
    .join(" · ");

const buildLayerJudgment = (
  layer: SignalLayerName,
  signals: readonly SignalResult[],
): SignalLayerJudgment => {
  const counts = countLayer(signals);
  const verdict = layerVerdict(counts);
  const confidence = layerConfidence(verdict, counts);
  return {
    layer,
    label: LAYER_LABELS[layer],
    verdict,
    verdictLabel: layer === "micro" && confidence === "low" ? "低置信" : DIRECTION_LABELS[verdict],
    rationale: layerRationale(counts),
    confidence,
    counts,
  };
};

const downgradeConfidence = (confidence: SignalJudgmentConfidence): SignalJudgmentConfidence =>
  confidence === "high" ? "medium" : confidence === "medium" ? "low" : confidence;

const buildOverall = (
  objectType: SignalResult["objectType"],
  layers: SignalLayerJudgment[],
): TechnicalSignalJudgmentSummary["overall"] => {
  const core = CORE_LAYERS.map((layer) => layers.find((item) => item.layer === layer)).filter(
    (layer): layer is SignalLayerJudgment => Boolean(layer),
  );
  const bullish = core.filter((layer) => layer.verdict === "bullish");
  const bearish = core.filter((layer) => layer.verdict === "bearish");
  const neutral = core.filter((layer) => layer.verdict === "neutral");
  const mixed = core.filter((layer) => layer.verdict === "mixed");

  let verdict: SignalJudgmentVerdict;
  if (core.every((layer) => layer.verdict === "insufficient")) {
    verdict = "insufficient";
  } else if (bullish.length > bearish.length) {
    verdict = "bullish";
  } else if (bearish.length > bullish.length) {
    verdict = "bearish";
  } else if (bullish.length > 0 && bearish.length > 0) {
    verdict = "mixed";
  } else if (neutral.length > 0) {
    verdict = "neutral";
  } else if (mixed.length > 0) {
    verdict = "mixed";
  } else {
    verdict = "insufficient";
  }

  let confidence: SignalJudgmentConfidence;
  if (verdict === "insufficient") {
    confidence = "insufficient";
  } else if (Math.max(bullish.length, bearish.length) >= 2) {
    confidence = "medium";
  } else if (verdict === "neutral" || verdict === "mixed") {
    confidence = neutral.length > 0 ? "low" : "insufficient";
  } else {
    confidence = "low";
  }

  const micro = objectType === "stock" ? layers.find((layer) => layer.layer === "micro") : null;
  if (micro && (micro.confidence === "low" || micro.confidence === "insufficient")) {
    confidence = downgradeConfidence(confidence);
  }

  const coreDescription = core.map((layer) => `${layer.label}${layer.verdictLabel}`).join("、");
  const participating = CORE_LAYERS.filter((layer) =>
    [...bullish, ...bearish].some((judgment) => judgment.layer === layer),
  );
  const rationale = [
    coreDescription || "核心层没有可用判断",
    participating.length > 0 ? `${participating.length} 个核心层参与方向投票` : "无方向票",
    micro ? "微观结构只调整置信度，不覆盖核心层结论" : "",
  ]
    .filter(Boolean)
    .join("；");

  return {
    verdict,
    verdictLabel: OVERALL_LABELS[verdict],
    headline: HEADLINES[verdict],
    rationale,
    confidence,
    coreLayers: participating,
  };
};

export function buildSignalJudgmentSummary(input: {
  objectType: SignalResult["objectType"];
  signals: readonly SignalResult[];
}): TechnicalSignalJudgmentSummary {
  const byLayer = new Map<SignalLayerName, SignalResult[]>();
  for (const signal of input.signals) {
    const layer = layerFromSignalId(signal.signalId);
    const layerSignals = byLayer.get(layer) ?? [];
    layerSignals.push(signal);
    byLayer.set(layer, layerSignals);
  }
  const layers = LAYER_ORDER.filter((layer) => byLayer.has(layer)).map((layer) =>
    buildLayerJudgment(layer, byLayer.get(layer) ?? []),
  );
  const coreCoverage = CORE_LAYERS.map((layer) =>
    layers.find((item) => item.layer === layer),
  ).filter((layer): layer is SignalLayerJudgment => Boolean(layer));
  const total = coreCoverage.reduce((sum, layer) => sum + layer.counts.total, 0);
  const usable = coreCoverage.reduce((sum, layer) => sum + layer.counts.usable, 0);
  return {
    summaryVersion: SIGNAL_JUDGMENT_VERSION,
    overall: buildOverall(input.objectType, layers),
    layers,
    counts: countStatuses(input.signals),
    keySignals: input.signals
      .filter(
        (signal: SignalResult) =>
          signal.status === "triggered" ||
          signal.status === "invalidated" ||
          signal.status === "low-confidence",
      )
      .slice(0, 4)
      .map((signal) => signal.signalId),
    coverage: total === 0 ? 0 : usable / total,
  };
}
