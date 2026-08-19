/**
 * 因子表达式生成 Agent
 *
 * 根据用户输入的因子描述，生成 AKQuant 因子表达式。
 * 严格限定在 AKQuant 支持的「列 / 算子 / 语法」范围内；
 * 当现有表达式无法表达用户需求时，必须明确返回「无法生成」，禁止编造不存在的算子或语法。
 */
import { Agent } from "@mastra/core/agent";

// ---------------------------------------------------------------------------
// AKQuant 表达式知识库
// 与前端 apps/web/src/lib/akquantFactors.ts 保持一致，作为提示词的知识来源。
// ---------------------------------------------------------------------------

/** 可用行情列 */
const COLUMNS = ["Close", "Open", "High", "Low", "Volume"];

/** 内置因子示例（帮助模型理解表达式的书写风格与算子的组合方式） */
const FACTOR_EXAMPLES: Array<{ name: string; expression: string }> = [
  { name: "roc_5", expression: "Close / Ref(Close, 5) - 1" },
  { name: "roc_20", expression: "Close / Ref(Close, 20) - 1" },
  {
    name: "rsi_14",
    expression:
      "100 - 100 / (1 + Mean(If(Delta(Close,1) > 0, Delta(Close,1), 0), 14) / Mean(If(Delta(Close,1) < 0, -Delta(Close,1), 0), 14))",
  },
  {
    name: "macd_diff",
    expression:
      "Mean(Close,12) - Mean(Close,26) - Mean(Mean(Close,12) - Mean(Close,26), 9)",
  },
  { name: "ma_trend_20", expression: "Close / Mean(Close, 20) - 1" },
  { name: "ma_trend_60", expression: "Close / Mean(Close, 60) - 1" },
  {
    name: "close_position",
    expression: "(Close - Min(Low, 20)) / (Max(High, 20) - Min(Low, 20))",
  },
  { name: "volume_ratio_5", expression: "Volume / Mean(Volume, 5)" },
  {
    name: "mfi_14",
    expression:
      "100 - 100 / (1 + Sum(If(Delta(Close,1) > 0, Close*Volume, 0), 14) / Sum(If(Delta(Close,1) < 0, Close*Volume, 0), 14))",
  },
  { name: "atr_ratio_14", expression: "Mean(High - Low, 14) / Close" },
];

/** 全部算子（含签名、别名与中文说明） */
const OPERATORS = `
时序算子（按个股滚动）：
- Mean(x, d)（别名 Ts_Mean）：d 日滚动均值
- Std(x, d)（别名 Ts_Std）：d 日滚动标准差
- Max(x, d)（别名 Ts_Max）：d 日滚动最大值
- Min(x, d)（别名 Ts_Min）：d 日滚动最小值
- Sum(x, d)（别名 Ts_Sum）：d 日滚动求和
- Corr(x, y, d)（别名 Ts_Corr）：d 日滚动相关系数
- Cov(x, y, d)（别名 Ts_Cov）：d 日滚动协方差
- Ref(x, d)（别名 Delay）：滞后 d 期，即 x(t-d)
- Delta(x, d)：差分，即 x(t) - x(t-d)
- ArgMax(x, d)（别名 Ts_ArgMax）：d 日内最大值距今天数
- ArgMin(x, d)（别名 Ts_ArgMin）：d 日内最小值距今天数
- Ts_Rank(x, d)：d 日内当前值排名 (0-1)

截面算子（按日期横向）：
- Rank(x)：截面排名 (0-1)
- Scale(x)：归一化使 ∑|x| = 1
- Standardize(x)（别名 ZScore）：Z-score 标准化
- Winsorize(x, limit)：均值 ± limit·std 截断
- WinsorizeQuantile(x, lo, hi)：分位数截断
- Neutralize(x, group)（别名 IndNeutralize）：按 group 中性化（如行业）

数学 / 逻辑算子（元素级）：
- Log(x)：自然对数
- Abs(x)：绝对值
- Sign(x)：符号 (-1/0/1)
- SignedPower(x, e)：带符号幂 sign(x)·|x|^e
- If(cond, t, f)：条件分支
`.trim();

/** 运算符与语法 */
const SYNTAX = `
运算符：+ - * / ** %
比较：< <= > >= == !=
三元：x if cond else y
`.trim();

// ---------------------------------------------------------------------------
// Agent 定义
// ---------------------------------------------------------------------------

export const factorGenerator = new Agent({
  id: "factor-generator",
  name: "因子表达式生成器",
  model: "deepseek/deepseek-v4-pro",
  instructions: `你是一个专业的 AKQuant 因子表达式生成器。用户会给你一段因子的中文描述，你的任务是把它转换成一条合法的 AKQuant 因子表达式。

## 可用行情列（仅限这些，禁止使用其他列名）
${COLUMNS.join("、")}

## 全部算子（仅限这些，禁止使用未列出的算子）
${OPERATORS}

## 支持的运算符与语法
${SYNTAX}

## 内置因子示例（供你参考书写风格与算子组合方式）
${FACTOR_EXAMPLES.map((f) => `- ${f.name}: ${f.expression}`).join("\n")}

## 生成规则（必须严格遵守）
1. 只能使用上面列出的「行情列」「算子」「运算符与语法」来构造表达式。
2. 描述中的常见概念按如下映射理解（如无更贴切方式，用这些近似）：
   - 「涨跌幅 / 收益率」：Close / Ref(Close, d) - 1
   - 「均线 / 移动平均」：Mean(Close, d)
   - 「波动率 / 振幅」：Std(Close, d)、Mean(High - Low, d) 等
3. 表达式必须语法正确、括号匹配、算子参数个数正确。
4. 如果现有算子/列/语法「无法」准确表达用户描述的含义，绝对不要编造、也不要勉强拼凑一个语义错误的表达式，直接输出：无法生成

## 输出格式（极其重要）
- 只输出一个结果，不要输出任何解释、注释、Markdown 代码块、前后缀文字。
- 成功时：只输出表达式本身，例如：Close / Ref(Close, 5) - 1
- 失败时：只输出四个字：无法生成`,
});
