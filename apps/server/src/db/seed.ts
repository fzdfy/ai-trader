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
 */
const SEED_FACTORS = [
  { name: "roc_5", label: "5日动量", category: "momentum", direction: 1, description: "近5日涨跌幅" },
  { name: "roc_20", label: "20日动量", category: "momentum", direction: 1, description: "近20日涨跌幅" },
  { name: "rsi_14", label: "RSI(14)", category: "momentum", direction: 1, description: "相对强弱指标" },
  { name: "macd_diff", label: "MACD柱", category: "momentum", direction: 1, description: "MACD 柱值" },
  { name: "ma_trend_20", label: "MA趋势(20)", category: "trend", direction: 1, description: "收盘价相对20日均线偏离" },
  { name: "ma_trend_60", label: "MA趋势(60)", category: "trend", direction: 1, description: "收盘价相对60日均线偏离" },
  { name: "close_position", label: "价格位置(20)", category: "trend", direction: 1, description: "收盘价在20日高低区间位置" },
  { name: "volume_ratio_5", label: "量比(5)", category: "volume", direction: 1, description: "当日量相对5日均量" },
  { name: "mfi_14", label: "MFI(14)", category: "volume", direction: 1, description: "资金流量指标" },
  { name: "atr_ratio_14", label: "波动率(14)", category: "volatility", direction: -1, description: "ATR相对收盘价（反向）" },
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

/** 幂等地初始化内置因子（仅在表为空时写入）。 */
export async function ensureFactorsSeeded() {
  const existing = await db.select().from(factorRegistry).limit(1);
  if (existing.length > 0) return;
  await db.insert(factorRegistry).values(SEED_FACTORS).onConflictDoNothing();
}

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
      configJson: { factors: s.factors },
      isSystem: true,
    })),
  );
}
