import type {
  ObjectSubtype,
  SignalDirection,
  SignalQuality,
  SignalResult,
  SignalStatus,
} from "../../../../../packages/signal-catalog/src/contracts.ts";
import {
  CATALOG_VERSION,
  signals as catalogSignals,
} from "../../../../../packages/signal-catalog/src/index.ts";
import { computeDefinitionHash } from "../../../../../packages/signal-catalog/src/hash.ts";

interface AdvancedOptions {
  objectCode: string;
  asOf: string;
  computedAt: string;
  objectSubtype?: ObjectSubtype | null;
}

interface ResultState {
  status: SignalStatus;
  direction: SignalDirection;
  value: number | string | null;
  quality: SignalQuality;
  notes?: string[];
  missingFields?: string[];
  sampleCount?: number;
}

const definitions = (scope: SignalResult["scope"]) =>
  catalogSignals.filter((signal) => signal.layer === "advanced" && signal.scope === scope);

const makeResult = (
  signalId: string,
  scope: SignalResult["scope"],
  options: AdvancedOptions,
  state: ResultState,
): SignalResult => {
  const definition = definitions(scope).find((signal) => signal.signalId === signalId);
  if (!definition) throw new Error(`unknown advanced signal: ${signalId}`);
  return {
    signalId,
    displayName: definition.displayName,
    rule: definition.rule,
    params: definition.params,
    confirmation: definition.confirmation,
    invalidation: definition.invalidation,
    dataRequirements: definition.dataRequirements,
    scope,
    objectType: scope,
    objectSubtype: scope === "sector" ? (options.objectSubtype ?? null) : null,
    objectCode: options.objectCode,
    status: state.status,
    direction: state.direction,
    value: state.value,
    unit: "score",
    quality: state.quality,
    proxy: false,
    sampleCount: state.sampleCount ?? 0,
    asOf: options.asOf,
    computedAt: options.computedAt,
    dataSources: ["server_factor_panel"],
    evidence: {
      components: [],
      notes: state.notes ?? [],
      missingFields: state.missingFields ?? [],
    },
    catalogVersion: CATALOG_VERSION,
    definitionHash: computeDefinitionHash(definition),
  };
};

const unavailable = (
  signalId: string,
  scope: SignalResult["scope"],
  options: AdvancedOptions,
  missingFields: string[],
  note: string,
) =>
  makeResult(signalId, scope, options, {
    status: "unavailable",
    direction: "neutral",
    value: null,
    quality: "missing",
    missingFields,
    notes: [note],
  });

const directionFromValue = (value: number): SignalDirection =>
  value > 0 ? "bullish" : value < 0 ? "bearish" : "neutral";

const statusFromValue = (value: number): SignalStatus =>
  value > 0 ? "triggered" : value < 0 ? "invalidated" : "neutral";

export interface MarketAdvancedContext {
  missingDomains?: string[];
  styleCoverage?: number;
  styleReturns: {
    growth: number;
    value: number;
    small: number;
    large: number;
    cyclical: number;
    defensive: number;
  };
  breadth: {
    advanceDeclineRatio: number;
    aboveMa200Ratio: number;
    breadthChange5: number;
  };
  realizedVolatility: number;
  volatilityPercentile: number;
  assetReturns: {
    aShare: number;
    gold: number;
    overseas: number;
    dollar: number;
  };
  factorStyleReturns: number[];
  amountChange20: number;
  turnoverChange20: number;
  concentrationTop100: number;
}

export function evaluateMarketAdvancedModels(
  context: MarketAdvancedContext | null,
  options: AdvancedOptions,
): SignalResult[] {
  if (context === null) {
    return definitions("market").map((definition) =>
      unavailable(
        definition.signalId,
        "market",
        options,
        definition.dataRequirements.map((requirement) => requirement.dataset),
        "大盘高级因子面板尚未就绪",
      ),
    );
  }
  const riskOn =
    (context.styleReturns.growth -
      context.styleReturns.value +
      context.styleReturns.small -
      context.styleReturns.large +
      context.styleReturns.cyclical -
      context.styleReturns.defensive) /
    3;
  const breadthScore = context.breadth.advanceDeclineRatio - 0.5 + context.breadth.breadthChange5;
  const positiveStyles =
    context.factorStyleReturns.filter((value) => value > 0).length /
    Math.max(context.factorStyleReturns.length, 1);
  const liquidity =
    (context.amountChange20 + context.turnoverChange20) / 2 -
    Math.max(0, context.concentrationTop100 - 0.5);
  const assetAverage =
    Object.values(context.assetReturns).reduce((sum, value) => sum + value, 0) /
    Object.values(context.assetReturns).length;

  return [
    makeResult("advanced.market.risk_on_off", "market", options, {
      status:
        (context.styleCoverage ?? 1) < 0.8
          ? "low-confidence"
          : statusFromValue(riskOn),
      direction:
        (context.styleCoverage ?? 1) < 0.8
          ? "neutral"
          : directionFromValue(riskOn),
      value: riskOn,
      quality: (context.styleCoverage ?? 1) < 0.8 ? "low" : "available",
      notes: ["成长/价值、大小盘、周期/防御风格证据已合成"],
      missingFields:
        (context.styleCoverage ?? 1) < 0.8 ? ["style_coverage"] : [],
    }),
    unavailable(
      "advanced.market.rates_valuation_cycle",
      "market",
      options,
      ["china_yield_curve"],
      "利率曲线数据未接入",
    ),
    makeResult("advanced.market.market_breadth_diffusion", "market", options, {
      status:
        context.missingDomains?.length && context.missingDomains.length > 0
          ? "low-confidence"
          : statusFromValue(breadthScore),
      direction:
        context.missingDomains?.length && context.missingDomains.length > 0
          ? "neutral"
          : directionFromValue(breadthScore),
      value: breadthScore,
      quality:
        context.missingDomains?.length && context.missingDomains.length > 0
          ? "low"
          : "available",
      notes: [
        `上涨家数比例=${context.breadth.advanceDeclineRatio}`,
        `MA200 上方比例=${context.breadth.aboveMa200Ratio}`,
        ...(context.missingDomains ?? []),
      ],
    }),
    makeResult("advanced.market.volatility_regime", "market", options, {
      status: context.volatilityPercentile >= 0.8 ? "triggered" : "neutral",
      direction: context.volatilityPercentile >= 0.8 ? "risk" : "neutral",
      value: context.volatilityPercentile,
      quality: "available",
      notes: [`20 日实现波动率=${context.realizedVolatility}`],
    }),
    makeResult("advanced.market.cross_asset_correlation", "market", options, {
      status: "neutral",
      direction: directionFromValue(assetAverage),
      value: assetAverage,
      quality: "low",
      notes: ["当前只有单期跨资产收益，缺少 60 日共同日期滚动相关"],
      missingFields: ["rolling_cross_asset_series"],
      sampleCount: 4,
    }),
    unavailable(
      "advanced.market.economic_cycle_leading",
      "market",
      options,
      ["china_macro_leading"],
      "PMI、社融、库存和盈利预期数据未接入",
    ),
    makeResult("advanced.market.factor_style_diffusion", "market", options, {
      status:
        context.factorStyleReturns.length < 6
          ? "low-confidence"
          : positiveStyles >= 0.6
            ? "triggered"
            : "invalidated",
      direction:
        context.factorStyleReturns.length < 6
          ? "neutral"
          : positiveStyles >= 0.6
            ? "bullish"
            : "bearish",
      value: positiveStyles,
      quality: context.factorStyleReturns.length < 6 ? "low" : "available",
      sampleCount: context.factorStyleReturns.length,
      missingFields:
        context.factorStyleReturns.length < 6
          ? ["factor_style_coverage"]
          : [],
    }),
    unavailable(
      "advanced.market.credit_cycle",
      "market",
      options,
      ["china_credit_cycle"],
      "信用利差与融资条件未接入",
    ),
    makeResult("advanced.market.market_liquidity_structure", "market", options, {
      status:
        context.missingDomains?.includes("turnover_change") ||
        context.missingDomains?.includes("concentration")
          ? "low-confidence"
          : statusFromValue(liquidity),
      direction:
        context.missingDomains?.includes("turnover_change") ||
        context.missingDomains?.includes("concentration")
          ? "neutral"
          : directionFromValue(liquidity),
      value: liquidity,
      quality:
        context.missingDomains?.includes("turnover_change") ||
        context.missingDomains?.includes("concentration")
          ? "low"
          : "available",
      notes: [`成交集中度 Top100=${context.concentrationTop100}`],
    }),
    unavailable(
      "advanced.market.hmm_market_regime",
      "market",
      options,
      ["validated_hmm_model"],
      "HMM 尚未完成样本外状态验证",
    ),
  ];
}

export interface SectorAdvancedContext {
  componentBreadthAvailable?: boolean;
  componentPositive: { d20: number; d60: number; d120: number };
  sectorReturn20: number;
  benchmarkReturn20: number;
  benchmarkAvailable?: boolean;
  relativeStrengthPercentile60: number;
  fundFlow: { mainNet: number; persistenceDays: number };
  fundFlowHistoryAvailable?: boolean;
  earningsCoverage: number;
  earningsGrowth: number;
  revisionScore: number;
  valuationPercentile: number;
  leaderResonance: boolean;
  crowdingPercentile: number;
  factorCoverage: {
    momentum: number;
    quality: number;
    valuation: number;
    volatility: number;
    fundflow: number;
  };
  factorScores?: {
    momentum: number;
    quality: number;
    valuation: number;
    volatility: number;
    fundflow: number;
  };
}

export function evaluateSectorAdvancedModels(
  context: SectorAdvancedContext | null,
  options: AdvancedOptions,
): SignalResult[] {
  if (options.objectSubtype !== "industry" && options.objectSubtype !== "concept") {
    throw new Error("sector advanced models require industry or concept subtype");
  }
  if (context === null) {
    return definitions("sector").map((definition) =>
      definition.name === "growth_defensive_rotation"
        ? makeResult(definition.signalId, "sector", options, {
            status: "not-applicable",
            direction: "neutral",
            value: null,
            quality: "not-applicable",
            notes: ["板块详情引用市场级成长/防守背景"],
          })
        : unavailable(
            definition.signalId,
            "sector",
            options,
            definition.dataRequirements.map((requirement) => requirement.dataset),
            "板块高级因子面板尚未就绪",
          ),
    );
  }
  const momentum =
    (context.componentPositive.d20 +
      context.componentPositive.d60 +
      context.componentPositive.d120) /
    3;
  const relativeStrength =
    context.sectorReturn20 -
    context.benchmarkReturn20 +
    (context.relativeStrengthPercentile60 - 0.5) * 0.1;
  const coverage = Object.values(context.factorCoverage);
  const minimumCoverage = Math.min(...coverage);
  const factorScore = context.factorScores
    ? context.factorScores.momentum * 0.3 +
      context.factorScores.quality * 0.2 +
      context.factorScores.valuation * 0.2 +
      context.factorScores.volatility * 0.15 +
      context.factorScores.fundflow * 0.15
    : null;

  return [
    makeResult("advanced.sector.growth_defensive_rotation", "sector", options, {
      status: "not-applicable",
      direction: "neutral",
      value: null,
      quality: "not-applicable",
      notes: ["板块详情引用市场级成长/防守背景，不生成板块独立判断"],
    }),
    makeResult("advanced.sector.sector_momentum_diffusion", "sector", options, {
      status:
        context.componentBreadthAvailable === false
          ? "low-confidence"
          : statusFromValue(momentum - 0.5),
      direction:
        context.componentBreadthAvailable === false
          ? "neutral"
          : directionFromValue(momentum - 0.5),
      value: context.componentBreadthAvailable === false ? null : momentum,
      quality: context.componentBreadthAvailable === false ? "low" : "available",
      sampleCount: 3,
      missingFields: context.componentBreadthAvailable === false ? ["constituent_breadth"] : [],
    }),
    makeResult("advanced.sector.sector_relative_strength", "sector", options, {
      status:
        context.benchmarkAvailable === false
          ? "low-confidence"
          : statusFromValue(relativeStrength),
      direction:
        context.benchmarkAvailable === false
          ? "neutral"
          : directionFromValue(relativeStrength),
      value: relativeStrength,
      quality: context.benchmarkAvailable === false ? "low" : "available",
      missingFields:
        context.benchmarkAvailable === false ? ["benchmark_bars"] : [],
    }),
    makeResult("advanced.sector.industry_fund_flow", "sector", options, {
      status:
        context.fundFlowHistoryAvailable === false
          ? "low-confidence"
          : context.fundFlow.mainNet > 0 && context.fundFlow.persistenceDays >= 2
          ? "triggered"
          : context.fundFlow.mainNet < 0
            ? "invalidated"
            : "neutral",
      direction: directionFromValue(context.fundFlow.mainNet),
      value: context.fundFlow.mainNet,
      quality: context.fundFlowHistoryAvailable === false ? "low" : "available",
      notes: [`连续流入天数=${context.fundFlow.persistenceDays}`],
      missingFields:
        context.fundFlowHistoryAvailable === false
          ? ["historical_fund_flow"]
          : [],
    }),
    makeResult("advanced.sector.earnings_cycle_revision", "sector", options, {
      status:
        context.earningsCoverage < 0.8
          ? "low-confidence"
          : statusFromValue(context.earningsGrowth + context.revisionScore),
      direction: directionFromValue(context.earningsGrowth + context.revisionScore),
      value: context.earningsGrowth + context.revisionScore,
      quality: context.earningsCoverage < 0.8 ? "low" : "available",
      notes: [`盈利修正覆盖率=${context.earningsCoverage}`],
    }),
    makeResult("advanced.sector.valuation_rotation", "sector", options, {
      status:
        context.valuationPercentile < 0.5 && context.earningsGrowth > 0
          ? "triggered"
          : context.valuationPercentile > 0.8
            ? "invalidated"
            : "neutral",
      direction:
        context.valuationPercentile < 0.5 && context.earningsGrowth > 0
          ? "bullish"
          : context.valuationPercentile > 0.8
            ? "bearish"
            : "neutral",
      value: context.valuationPercentile,
      quality: "low",
      notes: ["估值聚合仍依赖成分覆盖率，首版保持低置信"],
    }),
    unavailable(
      "advanced.sector.supply_chain_cycle",
      "sector",
      options,
      ["supply_chain_prosperity"],
      "产业链价格、订单和景气数据未接入",
    ),
    makeResult("advanced.sector.leader_sector_resonance", "sector", options, {
      status: context.leaderResonance ? "triggered" : "neutral",
      direction: context.leaderResonance ? "bullish" : "neutral",
      value: context.leaderResonance ? 1 : 0,
      quality: "available",
    }),
    makeResult("advanced.sector.crowding_reversal", "sector", options, {
      status: context.crowdingPercentile >= 0.85 ? "triggered" : "neutral",
      direction: context.crowdingPercentile >= 0.85 ? "risk" : "neutral",
      value: context.crowdingPercentile,
      quality: "available",
    }),
    makeResult("advanced.sector.sector_multifactor_allocation", "sector", options, {
      status:
        minimumCoverage < 0.8 || factorScore == null
          ? "low-confidence"
          : statusFromValue(factorScore - 0.5),
      direction: factorScore == null ? "neutral" : directionFromValue(factorScore - 0.5),
      value: factorScore,
      quality: minimumCoverage < 0.8 || factorScore == null ? "low" : "available",
      notes: [
        `最低因子覆盖率=${minimumCoverage}`,
        ...(factorScore == null ? ["缺少因子分数，不以覆盖率冒充配置得分"] : []),
      ],
    }),
  ];
}

export interface StockAdvancedContext {
  returns: { d20: number; d60: number; d120: number };
  benchmarkReturns: { d20: number; d60: number; d120: number };
  fundamentals: {
    marketCapPercentile: number;
    pbPercentile: number;
    roe: number;
    assetGrowth: number;
    grossMargin: number;
    cashFlowGrowth: number;
  };
  earningsRevision: number | null;
  accumulation: { obvSlope20: number; priceVolumeCorrelation: number };
  volatility: { atrPercentile: number; bollingerPercentile: number };
  chip: { holderChange90: number; costSupportDistance: number };
  industryRelativeStrength20: number;
  events: Array<{ direction: "bullish" | "bearish" | "neutral"; confidence: number }>;
  factorCoverage: {
    momentum: number;
    quality: number;
    valuation: number;
    revision: number;
    riskLiquidity: number;
  };
  fundamentalCoverage?: number;
  chipAvailable?: boolean;
  factorScores?: {
    momentum: number;
    quality: number;
    valuation: number;
    revision: number;
    riskLiquidity: number;
  };
  famaFrenchExposures?: {
    size: number;
    value: number;
    profitability: number;
    investment: number;
  };
}

export function evaluateStockAdvancedModels(
  context: StockAdvancedContext | null,
  options: AdvancedOptions,
): SignalResult[] {
  if (context === null) {
    return definitions("stock").map((definition) =>
      unavailable(
        definition.signalId,
        "stock",
        options,
        definition.dataRequirements.map((requirement) => requirement.dataset),
        "个股高级因子面板尚未就绪",
      ),
    );
  }
  const alpha =
    (context.returns.d20 -
      context.benchmarkReturns.d20 +
      (context.returns.d60 - context.benchmarkReturns.d60) +
      (context.returns.d120 - context.benchmarkReturns.d120)) /
    3;
  const qualityGrowth =
    context.fundamentals.roe +
    context.fundamentals.grossMargin / 10 +
    context.fundamentals.cashFlowGrowth -
    context.fundamentals.assetGrowth / 2;
  const accumulation =
    context.accumulation.obvSlope20 + context.accumulation.priceVolumeCorrelation;
  const compression =
    1 - Math.max(context.volatility.atrPercentile, context.volatility.bollingerPercentile);
  const eventScore = context.events.reduce(
    (sum, event) =>
      sum +
      (event.direction === "bullish"
        ? event.confidence
        : event.direction === "bearish"
          ? -event.confidence
          : 0),
    0,
  );
  const coverage = Object.values(context.factorCoverage);
  const minimumCoverage = Math.min(...coverage);
  const factorScore = context.factorScores
    ? context.factorScores.momentum * 0.25 +
      context.factorScores.quality * 0.2 +
      context.factorScores.valuation * 0.15 +
      context.factorScores.revision * 0.2 +
      context.factorScores.riskLiquidity * 0.2
    : null;

  return [
    makeResult("advanced.stock.alpha_momentum", "stock", options, {
      status: statusFromValue(alpha),
      direction: directionFromValue(alpha),
      value: alpha,
      quality: "available",
      sampleCount: 120,
    }),
    makeResult("advanced.stock.fama_french", "stock", options, {
      status: context.famaFrenchExposures ? "neutral" : "low-confidence",
      direction: "neutral",
      value: context.famaFrenchExposures
        ? (context.famaFrenchExposures.size +
            context.famaFrenchExposures.value +
            context.famaFrenchExposures.profitability +
            context.famaFrenchExposures.investment) /
          4
        : null,
      quality: "low",
      notes: [
        "输出四类暴露，不合成未经验证的预期收益",
        ...(context.famaFrenchExposures ? [] : ["缺少 Fama-French 四类暴露"]),
      ],
    }),
    makeResult("advanced.stock.quality_growth", "stock", options, {
      status:
        (context.fundamentalCoverage ?? 1) < 0.8
          ? "low-confidence"
          : statusFromValue(qualityGrowth),
      direction:
        (context.fundamentalCoverage ?? 1) < 0.8 ? "neutral" : directionFromValue(qualityGrowth),
      value: (context.fundamentalCoverage ?? 1) < 0.8 ? null : qualityGrowth,
      quality: (context.fundamentalCoverage ?? 1) < 0.8 ? "low" : "available",
      notes: [`财务因子覆盖率=${context.fundamentalCoverage ?? 1}`],
      missingFields: (context.fundamentalCoverage ?? 1) < 0.8 ? ["fundamental_coverage"] : [],
    }),
    context.earningsRevision == null
      ? unavailable(
          "advanced.stock.earnings_revision",
          "stock",
          options,
          ["earnings_consensus"],
          "一致预期修正数据不可用",
        )
      : makeResult("advanced.stock.earnings_revision", "stock", options, {
          status: statusFromValue(context.earningsRevision),
          direction: directionFromValue(context.earningsRevision),
          value: context.earningsRevision,
          quality: "available",
        }),
    makeResult("advanced.stock.accumulation_distribution", "stock", options, {
      status: statusFromValue(accumulation),
      direction: directionFromValue(accumulation),
      value: accumulation,
      quality: "available",
    }),
    makeResult("advanced.stock.volatility_squeeze_breakout", "stock", options, {
      status: compression > 0.75 ? "triggered" : "neutral",
      direction: compression > 0.75 ? "bullish" : "neutral",
      value: compression,
      quality: "available",
    }),
    context.chipAvailable === false
      ? unavailable(
          "advanced.stock.chip_concentration",
          "stock",
          options,
          ["holder_count", "price_volume_profile"],
          "股东户数与分价筹码数据未接入",
        )
      : makeResult("advanced.stock.chip_concentration", "stock", options, {
          status:
            context.chip.holderChange90 < 0 && context.chip.costSupportDistance < 0.08
              ? "triggered"
              : "neutral",
          direction: context.chip.holderChange90 < 0 ? "bullish" : "neutral",
          value:
            -context.chip.holderChange90 + Math.max(0, 0.08 - context.chip.costSupportDistance),
          quality: "low",
          notes: ["筹码结构依赖季度股东户数与分价成交量覆盖"],
        }),
    makeResult("advanced.stock.industry_relative_strength", "stock", options, {
      status: statusFromValue(context.industryRelativeStrength20),
      direction: directionFromValue(context.industryRelativeStrength20),
      value: context.industryRelativeStrength20,
      quality: "available",
    }),
    context.events.length === 0
      ? unavailable(
          "advanced.stock.event_driven",
          "stock",
          options,
          ["structured_company_events"],
          "有效事件窗口内没有可验证的结构化事件",
        )
      : makeResult("advanced.stock.event_driven", "stock", options, {
          status: statusFromValue(eventScore),
          direction: directionFromValue(eventScore),
          value: eventScore,
          quality: "low",
          sampleCount: context.events.length,
        }),
    makeResult("advanced.stock.stock_multifactor_expected_return", "stock", options, {
      status:
        minimumCoverage < 0.8 || factorScore == null
          ? "low-confidence"
          : statusFromValue(factorScore - 0.5),
      direction: factorScore == null ? "neutral" : directionFromValue(factorScore - 0.5),
      value: factorScore,
      quality: minimumCoverage < 0.8 || factorScore == null ? "low" : "available",
      notes: [
        `最低因子覆盖率=${minimumCoverage}`,
        ...(factorScore == null ? ["缺少因子分数，不以覆盖率冒充综合得分"] : []),
      ],
    }),
  ];
}

export function evaluateGoldAdvancedModels(options: AdvancedOptions): SignalResult[] {
  return definitions("gold").map((definition) =>
    unavailable(
      definition.signalId,
      "gold",
      options,
      definition.dataRequirements.map((requirement) => requirement.dataset),
      `黄金宏观模型待接入：${definition.dataRequirements
        .map((requirement) => requirement.dataset)
        .join("、")}`,
    ),
  );
}
