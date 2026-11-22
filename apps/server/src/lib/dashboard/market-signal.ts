export interface MarketSignalInput {
  aShare: {
    price: number | null;
    ma20: number | null;
    close20Ago: number | null;
    changePct: number | null;
  };
  breadth: {
    risingIndustryRatio: number | null;
    positiveFundFlowRatio: number | null;
  };
  heat: {
    limitUpTotal: number | null;
    maxBoard: number | null;
    avgTurnover: number | null;
  };
  confidence: {
    selectedQuote: boolean;
    aShareQuotes: boolean;
    trendCoverage: boolean;
    breadthHeat: boolean;
  };
  asOf: string | null;
}

export interface MarketSignalFactor {
  key: "trend" | "breadth" | "heat";
  label: string;
  score: number | null;
  evidence: string;
}

export interface MarketSignal {
  stance: "risk_on" | "neutral" | "risk_off";
  headline: string;
  body: string;
  dataConfidence: number;
  factors: MarketSignalFactor[];
  modelVersion: "dashboard-signal-v1";
  asOf: string | null;
  quality: "available" | "low" | "missing";
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const finite = (value: number | null): value is number => value != null && Number.isFinite(value);

function trendFactor(input: MarketSignalInput["aShare"]): MarketSignalFactor {
  if (
    input.price == null ||
    input.ma20 == null ||
    input.close20Ago == null ||
    input.changePct == null
  ) {
    return { key: "trend", label: "趋势", score: null, evidence: "趋势证据缺失" };
  }
  const closeVsMa20Pct = (input.price / input.ma20 - 1) * 100;
  const return20Pct = (input.price / input.close20Ago - 1) * 100;
  return {
    key: "trend",
    label: "趋势",
    score: clamp(50 + closeVsMa20Pct * 4 + return20Pct * 2 + input.changePct * 3),
    evidence: `收盘较 MA20 ${closeVsMa20Pct.toFixed(2)}%，20 日收益 ${return20Pct.toFixed(2)}%，当日 ${input.changePct.toFixed(2)}%`,
  };
}

function breadthFactor(input: MarketSignalInput["breadth"]): MarketSignalFactor {
  if (![input.risingIndustryRatio, input.positiveFundFlowRatio].every(finite)) {
    return { key: "breadth", label: "广度", score: null, evidence: "广度证据缺失" };
  }
  return {
    key: "breadth",
    label: "广度",
    score: clamp(input.risingIndustryRatio! * 60 + input.positiveFundFlowRatio! * 40),
    evidence: `行业上涨占比 ${(input.risingIndustryRatio! * 100).toFixed(1)}%，资金净流入占比 ${(input.positiveFundFlowRatio! * 100).toFixed(1)}%`,
  };
}

function heatFactor(input: MarketSignalInput["heat"]): MarketSignalFactor {
  if (![input.limitUpTotal, input.maxBoard, input.avgTurnover].every(finite)) {
    return { key: "heat", label: "热度", score: null, evidence: "热度证据缺失" };
  }
  return {
    key: "heat",
    label: "热度",
    score: clamp(
      Math.min(input.limitUpTotal!, 100) * 0.5 +
        Math.min(input.maxBoard! * 10, 100) * 0.25 +
        Math.min(input.avgTurnover! * 10, 100) * 0.25,
    ),
    evidence: `涨停 ${input.limitUpTotal} 家，最高 ${input.maxBoard} 板，平均换手 ${input.avgTurnover!.toFixed(2)}%`,
  };
}

export function computeMarketSignal(input: MarketSignalInput): MarketSignal {
  const factors = [
    trendFactor(input.aShare),
    breadthFactor(input.breadth),
    heatFactor(input.heat),
  ];
  const missing = factors.filter((factor) => factor.score == null).length;
  const dataConfidence =
    25 *
    Object.values(input.confidence).filter(Boolean).length;
  const quality =
    missing >= 2 || dataConfidence < 40
      ? "missing"
      : missing === 1 || dataConfidence < 100
        ? "low"
        : "available";
  const scores = factors.map((factor) => factor.score ?? 50);
  const overall = scores[0]! * 0.5 + scores[1]! * 0.3 + scores[2]! * 0.2;
  const stance: MarketSignal["stance"] =
    quality === "missing" ? "neutral" : overall >= 65 ? "risk_on" : overall <= 35 ? "risk_off" : "neutral";
  const headline =
    quality === "missing"
      ? "关键证据不足，暂不生成方向。"
      : stance === "risk_on"
        ? "趋势与广度同步改善，风险偏好回升。"
        : stance === "risk_off"
          ? "趋势承压，广度同步收缩。"
          : "市场证据分化，维持中性观察。";
  const body =
    quality === "missing"
      ? "至少两项核心因子未达到最低完整度。系统保留中性状态，不把缺失数据解释为看空。"
      : factors.map((factor) => `${factor.label}：${factor.evidence}`).join("；");
  return {
    stance,
    headline,
    body,
    dataConfidence,
    factors,
    modelVersion: "dashboard-signal-v1",
    asOf: input.asOf,
    quality,
  };
}
