/**
 * 因子表达式生成 Agent
 *
 * 根据用户输入的因子描述，生成 AKQuant 因子表达式。
 * 严格限定在 AKQuant 支持的「列 / 算子 / 语法」范围内；
 * 当现有表达式无法表达用户需求时，必须明确返回「无法生成」，禁止编造不存在的算子或语法。
 *
 * 提示词中的「行情列 / 算子 / 运算符与语法」三份白名单同时也是
 * validateFactorExpression 的校验依据，保证「提示词里列出的」与「实际强制的」永远同源。
 */
import { Agent } from "@mastra/core/agent";

// ---------------------------------------------------------------------------
// AKQuant 表达式知识库
// 与前端 apps/web/src/lib/akquantFactors.ts 保持一致，作为提示词的知识来源。
// ---------------------------------------------------------------------------

/** 可用行情列 */
const COLUMNS = ["Close", "Open", "High", "Low", "Volume"];

/** 行情列（小写）集合：AKQuant 解析列名时会统一转小写，故校验不区分大小写 */
const COLUMN_SET = new Set(COLUMNS.map((column) => column.toLowerCase()));

// ---------------------------------------------------------------------------
// 算子白名单（结构化）
// 与 AKQuant 的 OPS_MAP 一一对应；params 的个数即该算子的参数个数约束。
// ---------------------------------------------------------------------------

interface OperatorSpec {
  /** 所属分组，仅用于渲染提示词 */
  group: string;
  /** 算子主名 */
  name: string;
  /** 别名（引擎中等价的名字） */
  alias?: string;
  /** 形参名，个数即参数个数 */
  params: string[];
  /** 中文说明 */
  description: string;
}

const TIME_SERIES_GROUP = "时序算子（按个股滚动）";
const CROSS_SECTION_GROUP = "截面算子（按日期横向）";
const MATH_LOGIC_GROUP = "数学 / 逻辑算子（元素级）";
const OPERATOR_GROUPS = [TIME_SERIES_GROUP, CROSS_SECTION_GROUP, MATH_LOGIC_GROUP];

/** 全部算子（含签名、别名与中文说明） */
const OPERATOR_SPECS: OperatorSpec[] = [
  { group: TIME_SERIES_GROUP, name: "Mean", alias: "Ts_Mean", params: ["x", "d"], description: "d 日滚动均值" },
  { group: TIME_SERIES_GROUP, name: "Std", alias: "Ts_Std", params: ["x", "d"], description: "d 日滚动标准差" },
  { group: TIME_SERIES_GROUP, name: "Max", alias: "Ts_Max", params: ["x", "d"], description: "d 日滚动最大值" },
  { group: TIME_SERIES_GROUP, name: "Min", alias: "Ts_Min", params: ["x", "d"], description: "d 日滚动最小值" },
  { group: TIME_SERIES_GROUP, name: "Sum", alias: "Ts_Sum", params: ["x", "d"], description: "d 日滚动求和" },
  { group: TIME_SERIES_GROUP, name: "Corr", alias: "Ts_Corr", params: ["x", "y", "d"], description: "d 日滚动相关系数" },
  { group: TIME_SERIES_GROUP, name: "Cov", alias: "Ts_Cov", params: ["x", "y", "d"], description: "d 日滚动协方差" },
  { group: TIME_SERIES_GROUP, name: "Ref", alias: "Delay", params: ["x", "d"], description: "滞后 d 期，即 x(t-d)" },
  { group: TIME_SERIES_GROUP, name: "Delta", params: ["x", "d"], description: "差分，即 x(t) - x(t-d)" },
  { group: TIME_SERIES_GROUP, name: "ArgMax", alias: "Ts_ArgMax", params: ["x", "d"], description: "d 日内最大值距今天数" },
  { group: TIME_SERIES_GROUP, name: "ArgMin", alias: "Ts_ArgMin", params: ["x", "d"], description: "d 日内最小值距今天数" },
  { group: TIME_SERIES_GROUP, name: "Ts_Rank", params: ["x", "d"], description: "d 日内当前值排名 (0-1)" },
  { group: CROSS_SECTION_GROUP, name: "Rank", params: ["x"], description: "截面排名 (0-1)" },
  { group: CROSS_SECTION_GROUP, name: "Scale", params: ["x"], description: "归一化使 ∑|x| = 1" },
  { group: CROSS_SECTION_GROUP, name: "Standardize", alias: "ZScore", params: ["x"], description: "Z-score 标准化" },
  { group: CROSS_SECTION_GROUP, name: "Winsorize", params: ["x", "limit"], description: "均值 ± limit·std 截断" },
  { group: CROSS_SECTION_GROUP, name: "WinsorizeQuantile", params: ["x", "lo", "hi"], description: "分位数截断" },
  { group: CROSS_SECTION_GROUP, name: "Neutralize", alias: "IndNeutralize", params: ["x", "group"], description: "按 group 中性化（如行业）" },
  { group: MATH_LOGIC_GROUP, name: "Log", params: ["x"], description: "自然对数" },
  { group: MATH_LOGIC_GROUP, name: "Abs", params: ["x"], description: "绝对值" },
  { group: MATH_LOGIC_GROUP, name: "Sign", params: ["x"], description: "符号 (-1/0/1)" },
  { group: MATH_LOGIC_GROUP, name: "SignedPower", params: ["x", "e"], description: "带符号幂 sign(x)·|x|^e" },
  { group: MATH_LOGIC_GROUP, name: "If", params: ["cond", "t", "f"], description: "条件分支" },
];

/** 算子名（含别名）→ 参数个数 */
const OPERATOR_ARITY: Record<string, number> = Object.fromEntries(
  OPERATOR_SPECS.flatMap((spec) => {
    const entries: Array<[string, number]> = [[spec.name, spec.params.length]];
    if (spec.alias) entries.push([spec.alias, spec.params.length]);
    return entries;
  }),
);

/** 提示词中的算子清单，由 OPERATOR_SPECS 渲染而来 */
const OPERATORS = OPERATOR_GROUPS.map((group) =>
  [
    `${group}：`,
    ...OPERATOR_SPECS.filter((spec) => spec.group === group).map((spec) => {
      const signature = `${spec.name}(${spec.params.join(", ")})`;
      const alias = spec.alias ? `（别名 ${spec.alias}）` : "";
      return `- ${signature}${alias}：${spec.description}`;
    }),
  ].join("\n"),
).join("\n\n");

/** 运算符与语法 */
const SYNTAX = `
运算符：+ - * / ** %
比较：< <= > >= == !=
三元：x if cond else y
`.trim();

// ---------------------------------------------------------------------------
// 输出校验：表达式只能由上面的「行情列 / 算子 / 运算符与语法」构成
// 语法边界与 akquant/factor/parser.py 的 _visit 严格对齐：
//   支持 调用 / 列名 / 数字 / 二元运算 / 一元负号 / 单个比较 / 三元表达式
//   不支持 属性访问、下标、链式比较、and·or·not、字符串字面量、lambda、元组
// ---------------------------------------------------------------------------

/** 模型判定「无法表达」时输出的哨兵文案 */
export const FACTOR_GENERATION_FAILURE = "无法生成";

/** 表达式长度上限，避免异常长文本拖垮解析 */
const MAX_EXPRESSION_LENGTH = 1000;

/** 比较运算符 */
const COMPARISON_OPERATORS = new Set(["<", "<=", ">", ">=", "==", "!="]);

/** 双字符运算符（需先于单字符匹配） */
const MULTI_CHAR_OPERATORS = new Set(["**", "<=", ">=", "==", "!="]);

/** 单字符运算符与括号、分隔符 */
const SINGLE_CHAR_OPERATORS = "+-*/%(),<>";

/** Python 关键字：引擎不支持，单独提示避免被误判成行情列 */
const UNSUPPORTED_KEYWORDS = new Set([
  "and",
  "or",
  "not",
  "in",
  "is",
  "lambda",
  "True",
  "False",
  "None",
]);

interface FactorToken {
  type: "number" | "name" | "op" | "eof";
  value: string;
}

/**
 * 词法分析：把表达式切成数字 / 名字 / 运算符三类 token。
 * 出现白名单之外的字符时直接抛错（如 `[`、`"`、`~`、`.`）。
 */
function tokenize(expression: string): FactorToken[] {
  const tokens: FactorToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression.charAt(index);

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const twoChars = expression.slice(index, index + 2);
    if (MULTI_CHAR_OPERATORS.has(twoChars)) {
      tokens.push({ type: "op", value: twoChars });
      index += 2;
      continue;
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(expression.charAt(index + 1)))) {
      const matched = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(expression.slice(index));
      if (!matched) throw new Error(`无法识别的数字字面量（位置 ${index}）`);
      tokens.push({ type: "number", value: matched[0] });
      index += matched[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const matched = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expression.slice(index));
      if (!matched) throw new Error(`无法识别的标识符（位置 ${index}）`);
      tokens.push({ type: "name", value: matched[0] });
      index += matched[0].length;
      continue;
    }

    if (SINGLE_CHAR_OPERATORS.includes(char)) {
      tokens.push({ type: "op", value: char });
      index += 1;
      continue;
    }

    throw new Error(`不支持的字符 "${char}"（位置 ${index}）`);
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

/** 递归下降解析器：只做校验，不构建 AST */
class FactorExpressionParser {
  private index = 0;

  constructor(private readonly tokens: FactorToken[]) {}

  /** 解析整条表达式，结束后必须恰好到达末尾 */
  parse(): void {
    this.parseExpression();
    const token = this.peek();
    if (token.type !== "eof") {
      throw new Error(`表达式末尾存在多余内容 "${token.value}"`);
    }
  }

  private peek(offset = 0): FactorToken {
    const token = this.tokens[this.index + offset];
    if (!token) throw new Error("表达式意外结束");
    return token;
  }

  private isOp(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.type === "op" && token.value === value;
  }

  private isName(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.type === "name" && token.value === value;
  }

  private expectOp(value: string): void {
    if (!this.isOp(value)) throw new Error(`缺少 "${value}"`);
    this.index += 1;
  }

  /** 三元表达式：x if cond else y */
  private parseExpression(): void {
    this.parseComparison();

    if (this.isName("if")) {
      this.index += 1;
      this.parseComparison();
      if (!this.isName("else")) throw new Error('三元表达式缺少 "else"');
      this.index += 1;
      this.parseExpression();
    }
  }

  /** 单个比较运算（引擎明确不支持链式比较） */
  private parseComparison(): void {
    this.parseSum();

    const token = this.peek();
    if (token.type !== "op" || !COMPARISON_OPERATORS.has(token.value)) return;

    this.index += 1;
    this.parseSum();

    const next = this.peek();
    if (next.type === "op" && COMPARISON_OPERATORS.has(next.value)) {
      throw new Error("不支持链式比较，请改用 If 拆分");
    }
  }

  private parseSum(): void {
    this.parseTerm();
    while (this.isOp("+") || this.isOp("-")) {
      this.index += 1;
      this.parseTerm();
    }
  }

  private parseTerm(): void {
    this.parseUnary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      this.index += 1;
      this.parseUnary();
    }
  }

  private parseUnary(): void {
    if (this.isOp("-")) {
      this.index += 1;
      this.parseUnary();
      return;
    }
    if (this.isOp("+")) throw new Error("不支持一元 + 运算符");
    if (this.isOp("~") || this.isName("not")) {
      throw new Error('不支持逻辑取反 "~" / "not"，请改用 If');
    }
    this.parsePower();
  }

  private parsePower(): void {
    this.parseAtom();
    if (this.isOp("**")) {
      this.index += 1;
      this.parseUnary();
    }
  }

  private parseAtom(): void {
    const token = this.peek();

    if (token.type === "number") {
      this.index += 1;
      return;
    }

    if (token.type === "name") {
      this.parseNameOrCall();
      return;
    }

    if (this.isOp("(")) {
      this.index += 1;
      this.parseExpression();
      this.expectOp(")");
      return;
    }

    if (token.type === "eof") throw new Error("表达式意外结束");
    throw new Error(`不支持的字面量 "${token.value}"`);
  }

  /** 名字只允许是算子调用或行情列 */
  private parseNameOrCall(): void {
    const name = this.peek().value;
    this.index += 1;

    if (UNSUPPORTED_KEYWORDS.has(name)) {
      throw new Error(`不支持的关键字 "${name}"`);
    }

    if (this.isOp("(")) {
      this.index += 1;

      const arity = OPERATOR_ARITY[name];
      if (arity === undefined) throw new Error(`不支持的算子 "${name}"`);

      let count = 0;
      if (!this.isOp(")")) {
        this.parseExpression();
        count += 1;
        while (this.isOp(",")) {
          this.index += 1;
          this.parseExpression();
          count += 1;
        }
      }
      this.expectOp(")");

      if (count !== arity) {
        throw new Error(`算子 ${name} 需要 ${arity} 个参数，实际传入 ${count} 个`);
      }
      return;
    }

    if (!COLUMN_SET.has(name.toLowerCase())) {
      throw new Error(`不支持的行情列 "${name}"（仅支持 ${COLUMNS.join(" / ")}）`);
    }
  }
}

export type FactorExpressionValidation = { ok: true } | { ok: false; reason: string };

/**
 * 校验因子表达式：只能使用白名单内的「行情列 / 算子（含别名与参数个数）/ 运算符与语法」。
 *
 * @param expression 待校验的表达式
 * @returns ok=true 表示可被 AKQuant 接受；ok=false 时 reason 说明违规原因
 */
export function validateFactorExpression(expression: string): FactorExpressionValidation {
  const text = expression.trim();
  if (!text) return { ok: false, reason: "表达式为空" };
  if (text.length > MAX_EXPRESSION_LENGTH) {
    return { ok: false, reason: `表达式过长（上限 ${MAX_EXPRESSION_LENGTH} 字符）` };
  }

  try {
    new FactorExpressionParser(tokenize(text)).parse();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// ---------------------------------------------------------------------------
// Agent 定义
// ---------------------------------------------------------------------------

export const factorGenerator = new Agent({
  id: "factor-generator",
  name: "因子表达式生成器",
  model: "deepseek/deepseek-v4-flash",
  instructions: `你是一个专业的 AKQuant 因子表达式生成器。用户会给你一段因子的中文描述，你的任务是把它转换成一条合法的 AKQuant 因子表达式。

## 可用行情列（仅限这些，禁止使用其他列名）
${COLUMNS.join("、")}

## 全部算子（仅限这些，禁止使用未列出的算子）
${OPERATORS}

## 支持的运算符与语法
${SYNTAX}

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
