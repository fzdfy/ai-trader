import { db } from "./index";
import { factorRegistry, strategyConfig } from "./schema";
import { eq } from "drizzle-orm";

/**
 * 内置因子种子数据（对齐 quant 服务 factors/registry.py 的 FACTOR_REGISTRY）。
 * 字段说明：
 *  - name：因子唯一标识（英文 key）
 *  - label：中文显示名
 *  - category：因子分类（momentum/trend/volume/volatility）
 *  - direction：1=正向因子，-1=反向因子
 *  - description：因子描述
 *  - createdBy：创建者（system=内置，atrus=atrus 团队新增）
 */
interface SeedFactor {
  name: string;
  label: string;
  category: string;
  direction: number;
  description: string;
  createdBy?: string;
  isPublic?: boolean;
}

const SEED_FACTORS: SeedFactor[] = [
  {
    name: "roc_5",
    label: "5日动量",
    category: "momentum",
    direction: 1,
    description: "近5日涨跌幅",
  },
  {
    name: "roc_20",
    label: "20日动量",
    category: "momentum",
    direction: 1,
    description: "近20日涨跌幅",
  },
  {
    name: "rsi_6",
    label: "RSI(6)",
    category: "momentum",
    direction: 1,
    description: "短期相对强弱指标",
    createdBy: "atrus",
    isPublic: true,
  },
  {
    name: "rsi_14",
    label: "RSI(14)",
    category: "momentum",
    direction: 1,
    description: "相对强弱指标",
  },
  {
    name: "macd_diff",
    label: "MACD柱",
    category: "momentum",
    direction: 1,
    description: "MACD 柱值",
  },
  {
    name: "ma_trend_5",
    label: "MA趋势(5)",
    category: "trend",
    direction: 1,
    description: "收盘价相对5日均线偏离",
    createdBy: "atrus",
    isPublic: true,
  },
  {
    name: "ma_trend_20",
    label: "MA趋势(20)",
    category: "trend",
    direction: 1,
    description: "收盘价相对20日均线偏离",
  },
  {
    name: "ma_trend_60",
    label: "MA趋势(60)",
    category: "trend",
    direction: 1,
    description: "收盘价相对60日均线偏离",
  },
  {
    name: "close_position",
    label: "价格位置(20)",
    category: "trend",
    direction: 1,
    description: "收盘价在20日高低区间位置",
  },
  {
    name: "volume_ratio_5",
    label: "量比(5)",
    category: "volume",
    direction: 1,
    description: "当日量相对5日均量",
  },
  {
    name: "mfi_14",
    label: "MFI(14)",
    category: "volume",
    direction: 1,
    description: "资金流量指标",
  },
  {
    name: "atr_ratio_14",
    label: "波动率(14)",
    category: "volatility",
    direction: -1,
    description: "ATR相对收盘价（反向）",
  },
  {
    name: "boll_position",
    label: "布林带位置",
    category: "volatility",
    direction: 1,
    description: "收盘价在20日布林带中的相对位置",
    createdBy: "atrus",
    isPublic: true,
  },
];

/**
 * 内置系统策略种子数据。
 * 策略 = 因子集合，每个因子带 value（信号阈值/参数值 0-100）与 weight（权重 0-100）。
 */
const SEED_STRATEGIES = [
  {
    name: "趋势跟随",
    description: "均线趋势 + 动量组合",
    factors: [
      { name: "ma_trend_20", weight: 40, value: 60 },
      { name: "roc_20", weight: 30, value: 50 },
      { name: "volume_ratio_5", weight: 30, value: 50 },
    ],
  },
  {
    name: "超跌反弹",
    description: "RSI 超卖 + 波动率",
    factors: [
      { name: "rsi_14", weight: 50, value: 30 },
      { name: "atr_ratio_14", weight: 50, value: 50 },
    ],
  },
  {
    name: "量价共振",
    description: "MACD + 资金流 + 量比",
    factors: [
      { name: "macd_diff", weight: 40, value: 50 },
      { name: "mfi_14", weight: 30, value: 50 },
      { name: "volume_ratio_5", weight: 30, value: 50 },
    ],
  },
];

/** 幂等地初始化内置因子（onConflictDoNothing 保证已存在因子不重复，新增因子自动补齐）。 */
export async function ensureFactorsSeeded() {
  await db.insert(factorRegistry).values(SEED_FACTORS).onConflictDoNothing();
}

/** 内置策略默认风控参数（0-100 百分比，对齐 quant composite 引擎默认值） */
const DEFAULT_TRADE_CONFIG = {
  combine: "weighted_sum",
  entry: { type: "threshold", value: 65 },
  exit: { type: "threshold", value: 30 },
  risk: { positionSize: 95, stopLoss: 8, takeProfit: 20 },
};

/** 幂等地初始化系统策略（仅在无系统策略时写入）。 */
export async function ensureStrategiesSeeded() {
  const existing = await db
    .select()
    .from(strategyConfig)
    .where(eq(strategyConfig.isSystem, true))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(strategyConfig).values(
    SEED_STRATEGIES.map((s) => ({
      userId: "system",
      name: s.name,
      description: s.description,
      configJson: { factors: s.factors, ...DEFAULT_TRADE_CONFIG },
      isSystem: true,
      isPublic: true, // 系统策略默认公开
    })),
  );
}

/**
 * atrus 团队 5 个 2026 年 A 股多因子策略（创建者 atrus，公开）。
 * 配置结构与 buildConfigJson 输出一致（百分比 0-100，费率万分比，金额元），
 * 完整覆盖信号层 / 入场层 / 出场层 / 仓位层 / 风控层 / 成本层。
 */
interface AtrusStrategyFactor {
  name: string;
  weight: number;
  value: number;
  direction: 1 | -1;
}

interface AtrusStrategySeed {
  name: string;
  description: string;
  configJson: {
    factors: AtrusStrategyFactor[];
    combine: string;
    entry: {
      type: "threshold" | "cross";
      value: number;
      volumeConfirm: boolean;
      limitFilter: boolean;
      stFilter: boolean;
      marketFilter: boolean;
    };
    exit: { type: "threshold" | "cross"; value: number; maxHoldingDays: number };
    position: {
      sizing: "fixed" | "kelly" | "atr";
      baseSize: number;
      maxSize: number;
      totalCap: number;
      maxPositions: number;
      kellyFraction: number;
      atrPeriod: number;
      atrRiskBudget: number;
      pyramiding: boolean;
      firstEntry: number;
      addOnProfit: number;
      addSize: number;
      maxAdds: number;
      partialExit: boolean;
      partialExitRatio: number;
    };
    risk: {
      positionSize: number;
      stopLoss: number;
      takeProfit: number;
      stopType: "fixed" | "trailing" | "atr";
      trailingStop: number;
      atrStopMultiple: number;
      takeType: "fixed" | "trailing";
      trailingTake: number;
      maxLossPerTrade: number;
      maxConsecutiveLosses: number;
    };
    cost: {
      commissionRate: number;
      stampTaxRate: number;
      transferFeeRate: number;
      minCommission: number;
      slippageType: "percent" | "fixed";
      slippageValue: number;
    };
  };
}

/** 默认成本（万3佣金 / 千1印花税 / 万0.1过户费 / 最低5元 / 万2滑点） */
const ATRUS_DEFAULT_COST = {
  commissionRate: 3,
  stampTaxRate: 10,
  transferFeeRate: 0.1,
  minCommission: 5,
  slippageType: "percent" as const,
  slippageValue: 2,
};

/** 默认仓位层（固定比例建仓，单票 1 只，不启用分批） */
const ATRUS_DEFAULT_POSITION = {
  sizing: "fixed" as const,
  maxSize: 95,
  totalCap: 100,
  maxPositions: 1,
  kellyFraction: 50,
  atrPeriod: 14,
  atrRiskBudget: 2,
  pyramiding: false,
  firstEntry: 50,
  addOnProfit: 5,
  addSize: 25,
  maxAdds: 2,
  partialExit: false,
  partialExitRatio: 50,
};

const ATRUS_STRATEGIES: AtrusStrategySeed[] = [
  {
    name: "趋势龙头",
    description: "中长期趋势 + 动量突破，捕捉 2026 结构性行情强势龙头",
    configJson: {
      factors: [
        { name: "ma_trend_60", weight: 30, value: 55, direction: 1 },
        { name: "ma_trend_20", weight: 25, value: 55, direction: 1 },
        { name: "roc_20", weight: 25, value: 55, direction: 1 },
        { name: "close_position", weight: 20, value: 60, direction: 1 },
      ],
      combine: "weighted_sum",
      entry: {
        type: "cross",
        value: 68,
        volumeConfirm: true,
        limitFilter: true,
        stFilter: true,
        marketFilter: false,
      },
      exit: { type: "threshold", value: 32, maxHoldingDays: 20 },
      position: {
        ...ATRUS_DEFAULT_POSITION,
        baseSize: 80,
        partialExit: true,
        partialExitRatio: 50,
      },
      risk: {
        positionSize: 80,
        stopLoss: 7,
        takeProfit: 25,
        stopType: "trailing",
        trailingStop: 8,
        atrStopMultiple: 2,
        takeType: "fixed",
        trailingTake: 10,
        maxLossPerTrade: 12,
        maxConsecutiveLosses: 3,
      },
      cost: ATRUS_DEFAULT_COST,
    },
  },
  {
    name: "短线动量",
    description: "短期趋势 + 量价爆发，捕捉题材轮动强势股",
    configJson: {
      factors: [
        { name: "ma_trend_5", weight: 35, value: 55, direction: 1 },
        { name: "rsi_6", weight: 25, value: 55, direction: 1 },
        { name: "volume_ratio_5", weight: 20, value: 55, direction: 1 },
        { name: "macd_diff", weight: 20, value: 50, direction: 1 },
      ],
      combine: "weighted_sum",
      entry: {
        type: "cross",
        value: 65,
        volumeConfirm: true,
        limitFilter: true,
        stFilter: true,
        marketFilter: true,
      },
      exit: { type: "threshold", value: 38, maxHoldingDays: 5 },
      position: { ...ATRUS_DEFAULT_POSITION, baseSize: 70, maxSize: 80 },
      risk: {
        positionSize: 70,
        stopLoss: 5,
        takeProfit: 12,
        stopType: "fixed",
        trailingStop: 5,
        atrStopMultiple: 2,
        takeType: "fixed",
        trailingTake: 8,
        maxLossPerTrade: 8,
        maxConsecutiveLosses: 4,
      },
      cost: ATRUS_DEFAULT_COST,
    },
  },
  {
    name: "低波稳健",
    description: "低波动 + 中期趋势，防守型稳健配置",
    configJson: {
      factors: [
        { name: "atr_ratio_14", weight: 30, value: 50, direction: 1 },
        { name: "ma_trend_20", weight: 30, value: 55, direction: 1 },
        { name: "roc_20", weight: 20, value: 55, direction: 1 },
        { name: "mfi_14", weight: 20, value: 50, direction: 1 },
      ],
      combine: "weighted_sum",
      entry: {
        type: "threshold",
        value: 60,
        volumeConfirm: false,
        limitFilter: false,
        stFilter: true,
        marketFilter: false,
      },
      exit: { type: "threshold", value: 30, maxHoldingDays: 30 },
      position: {
        ...ATRUS_DEFAULT_POSITION,
        sizing: "atr",
        baseSize: 70,
        maxSize: 85,
        atrRiskBudget: 1.5,
      },
      risk: {
        positionSize: 70,
        stopLoss: 6,
        takeProfit: 18,
        stopType: "fixed",
        trailingStop: 6,
        atrStopMultiple: 2,
        takeType: "fixed",
        trailingTake: 10,
        maxLossPerTrade: 10,
        maxConsecutiveLosses: 3,
      },
      cost: ATRUS_DEFAULT_COST,
    },
  },
  {
    name: "超跌反转",
    description: "布林带下轨 + RSI 超卖，急跌后的低吸反弹",
    configJson: {
      factors: [
        { name: "boll_position", weight: 30, value: 30, direction: -1 },
        { name: "rsi_14", weight: 30, value: 30, direction: -1 },
        { name: "close_position", weight: 20, value: 35, direction: -1 },
        { name: "volume_ratio_5", weight: 20, value: 50, direction: 1 },
      ],
      combine: "weighted_sum",
      entry: {
        type: "threshold",
        value: 60,
        volumeConfirm: false,
        limitFilter: true,
        stFilter: false,
        marketFilter: false,
      },
      exit: { type: "threshold", value: 40, maxHoldingDays: 10 },
      position: { ...ATRUS_DEFAULT_POSITION, baseSize: 60, maxSize: 70 },
      risk: {
        positionSize: 60,
        stopLoss: 6,
        takeProfit: 15,
        stopType: "fixed",
        trailingStop: 6,
        atrStopMultiple: 2,
        takeType: "fixed",
        trailingTake: 8,
        maxLossPerTrade: 8,
        maxConsecutiveLosses: 3,
      },
      cost: ATRUS_DEFAULT_COST,
    },
  },
  {
    name: "量价突破",
    description: "放量突破，MACD + 量比 + 价格位置共振",
    configJson: {
      factors: [
        { name: "macd_diff", weight: 30, value: 50, direction: 1 },
        { name: "volume_ratio_5", weight: 25, value: 60, direction: 1 },
        { name: "close_position", weight: 25, value: 65, direction: 1 },
        { name: "roc_5", weight: 20, value: 55, direction: 1 },
      ],
      combine: "weighted_sum",
      entry: {
        type: "cross",
        value: 70,
        volumeConfirm: true,
        limitFilter: true,
        stFilter: true,
        marketFilter: true,
      },
      exit: { type: "threshold", value: 35, maxHoldingDays: 8 },
      position: { ...ATRUS_DEFAULT_POSITION, baseSize: 75, maxSize: 85 },
      risk: {
        positionSize: 75,
        stopLoss: 6,
        takeProfit: 20,
        stopType: "trailing",
        trailingStop: 6,
        atrStopMultiple: 2,
        takeType: "fixed",
        trailingTake: 8,
        maxLossPerTrade: 10,
        maxConsecutiveLosses: 3,
      },
      cost: ATRUS_DEFAULT_COST,
    },
  },
];

/** 幂等地初始化 atrus 团队策略（仅在无 atrus 策略时写入）。 */
export async function ensureAtrusStrategiesSeeded() {
  const existing = await db
    .select()
    .from(strategyConfig)
    .where(eq(strategyConfig.userId, "NZm3rDfjYC7PfwilMgruTEOArWLVgNpn"))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(strategyConfig).values(
    ATRUS_STRATEGIES.map((s) => ({
      userId: "NZm3rDfjYC7PfwilMgruTEOArWLVgNpn",
      name: s.name,
      description: s.description,
      configJson: s.configJson,
      isSystem: false,
      isPublic: true, // atrus 团队策略公开
    })),
  );
}
