/**
 * AKQuant 因子表达式参考数据。
 *
 * 数据来源于 AKQuant 库（akquant/factor/ops.py 的 OPS_MAP 与 parser.py 的语法），
 * 用于在因子列表页展示「因子对应的表达式」以及「全部因子表达式」tooltip。
 */

// ---------- 类型 ----------

export interface AkquantOperator {
  /** 函数签名（主名），如 "Mean(x, d)" */
  signature: string;
  /** 别名（可选），如 "Ts_Mean" */
  alias?: string;
  /** 中文说明 */
  description: string;
}

export interface AkquantOperatorGroup {
  /** 分组名 */
  label: string;
  operators: AkquantOperator[];
}

// ---------- 因子 → AKQuant 表达式映射 ----------

/**
 * 内置因子对应的 AKQuant 表达式。
 * 说明：MA/RSI/MACD 等在 AKQuant 中无原生 EMA 算子，此处用 Mean（滚动均值，即 SMA）
 * 近似 EMA；ATR 用「日内波幅」近似（忽略跳空）。核心逻辑一致。
 */
export const AKQUANT_FACTOR_EXPRESSIONS: Record<string, string> = {
  roc_5: "Close / Ref(Close, 5) - 1",
  roc_20: "Close / Ref(Close, 20) - 1",
  rsi_14:
    "100 - 100 / (1 + Mean(If(Delta(Close,1) > 0, Delta(Close,1), 0), 14) / Mean(If(Delta(Close,1) < 0, -Delta(Close,1), 0), 14))",
  macd_diff:
    "Mean(Close,12) - Mean(Close,26) - Mean(Mean(Close,12) - Mean(Close,26), 9)",
  ma_trend_20: "Close / Mean(Close, 20) - 1",
  ma_trend_60: "Close / Mean(Close, 60) - 1",
  close_position: "(Close - Min(Low, 20)) / (Max(High, 20) - Min(Low, 20))",
  volume_ratio_5: "Volume / Mean(Volume, 5)",
  mfi_14:
    "100 - 100 / (1 + Sum(If(Delta(Close,1) > 0, Close*Volume, 0), 14) / Sum(If(Delta(Close,1) < 0, Close*Volume, 0), 14))",
  atr_ratio_14: "Mean(High - Low, 14) / Close",
};

// ---------- 全部算子清单 ----------

/** 可用列 */
export const AKQUANT_COLUMNS = ["Close", "Open", "High", "Low", "Volume"];

/** 全部算子（按类别分组） */
export const AKQUANT_OPERATOR_GROUPS: AkquantOperatorGroup[] = [
  {
    label: "时序算子（按个股滚动）",
    operators: [
      { signature: "Mean(x, d)", alias: "Ts_Mean", description: "d 日滚动均值" },
      { signature: "Std(x, d)", alias: "Ts_Std", description: "d 日滚动标准差" },
      { signature: "Max(x, d)", alias: "Ts_Max", description: "d 日滚动最大值" },
      { signature: "Min(x, d)", alias: "Ts_Min", description: "d 日滚动最小值" },
      { signature: "Sum(x, d)", alias: "Ts_Sum", description: "d 日滚动求和" },
      { signature: "Corr(x, y, d)", alias: "Ts_Corr", description: "d 日滚动相关系数" },
      { signature: "Cov(x, y, d)", alias: "Ts_Cov", description: "d 日滚动协方差" },
      { signature: "Ref(x, d)", alias: "Delay", description: "滞后 d 期，即 x(t-d)" },
      { signature: "Delta(x, d)", description: "差分，即 x(t) - x(t-d)" },
      { signature: "ArgMax(x, d)", alias: "Ts_ArgMax", description: "d 日内最大值距今天数" },
      { signature: "ArgMin(x, d)", alias: "Ts_ArgMin", description: "d 日内最小值距今天数" },
      { signature: "Ts_Rank(x, d)", description: "d 日内当前值排名 (0-1)" },
    ],
  },
  {
    label: "截面算子（按日期横向）",
    operators: [
      { signature: "Rank(x)", description: "截面排名 (0-1)" },
      { signature: "Scale(x)", description: "归一化使 ∑|x| = 1" },
      { signature: "Standardize(x)", alias: "ZScore", description: "Z-score 标准化" },
      { signature: "Winsorize(x, limit)", description: "均值 ± limit·std 截断" },
      { signature: "WinsorizeQuantile(x, lo, hi)", description: "分位数截断" },
      { signature: "Neutralize(x, group)", alias: "IndNeutralize", description: "按 group 中性化（如行业）" },
    ],
  },
  {
    label: "数学 / 逻辑算子（元素级）",
    operators: [
      { signature: "Log(x)", description: "自然对数" },
      { signature: "Abs(x)", description: "绝对值" },
      { signature: "Sign(x)", description: "符号 (-1/0/1)" },
      { signature: "SignedPower(x, e)", description: "带符号幂 sign(x)·|x|^e" },
      { signature: "If(cond, t, f)", description: "条件分支" },
    ],
  },
];

/** 支持的运算符与语法 */
export const AKQUANT_SYNTAX = [
  "运算符：+ - * / ** %",
  "比较：< <= > >= == !=",
  "三元：x if cond else y",
];
