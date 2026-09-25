/**
 * 因子 Python 代码生成 Agent
 *
 * 根据用户输入的因子描述，生成符合 AKQuant Python 因子契约的代码：
 * 入口固定为 compute(data)，data 为 { open/high/low/close/volume/amount: np.ndarray }，
 * 返回标量或与输入等长的数值序列。
 *
 * 提示词中的「可用数据列 / 运行约束」与前端 apps/web/src/components/FactorCodeReference.tsx
 * 展示的规则、以及真正的安全边界（apps/quant/factor_code.py 的 AST 白名单 + 超时看门狗、
 * apps/server/src/lib/factor-code.ts 的快速拒绝）保持同源，保证「提示词里允许的」与
 * 「实际强制的」永远一致。
 */
import { Agent } from "@mastra/core/agent";
import { FACTOR_GENERATION_FAILURE } from "./factor-generator";

/** data 字典中可直接读取的行情列 */
const DATA_COLUMNS = ["open", "high", "low", "close", "volume", "amount"];

/** 参考示例：20 日乖离率 */
const EXAMPLE_CODE = `def compute(data):
    close = data["close"]
    window = 20
    out = np.full(len(close), np.nan)
    for i in range(window - 1, len(close)):
        ma = np.mean(close[i - window + 1 : i + 1])
        out[i] = close[i] / ma - 1
    return out`;

/** 运行约束（与 quant/factor_code.py、server/lib/factor-code.ts 同源） */
const RUN_CONSTRAINTS = [
  "入口函数必须为 def compute(data)，只接收一个参数（参数名不限），返回标量或与输入等长的数值序列。",
  "data 为字典，值为 numpy 数组，可直接下标读取，长度等于该标的的日线根数。",
  "可用 np（numpy）与 math，以及 abs、min、max、sum、len、range、round、sorted 等安全内置函数。",
  "禁止 import、双下划线（dunder）名称、global / nonlocal、async / await、yield、装饰器，禁止 eval / exec / open 等危险调用；代码不超过 5000 字符。",
  "返回值由系统做横截面百分位归一化到 0-1，无需自行归一化。",
  "执行受限且带超时保护，请避免死循环与超大计算。",
];

export const factorCodeGenerator = new Agent({
  id: "factor-code-generator",
  name: "因子代码生成器",
  model: "deepseek/deepseek-v4-flash",
  instructions: `你是一个专业的 AKQuant Python 因子代码生成器。用户会给你一段因子的中文描述，你的任务是把它转换成一段可运行的 Python 因子代码。

## 可用行情列（data 字典的 key，仅限这些，禁止使用其他 key）
${DATA_COLUMNS.map((column) => `data["${column}"]`).join("、")}

## 运行约束（必须严格遵守）
${RUN_CONSTRAINTS.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}

## 参考示例（20 日乖离率）
${EXAMPLE_CODE}

## 生成规则
1. 必须定义且只定义 compute(data) 一个入口函数，只能使用上面列出的行情列与允许的内置函数 / 库。
2. 代码必须能独立运行：注意数据对齐，窗口不足处用 np.nan 占位，避免越界与除零。
3. 如果现有数据列与受限环境「无法」表达用户描述的含义，绝对不要编造不存在的列或库，直接输出：${FACTOR_GENERATION_FAILURE}

## 输出格式（极其重要）
- 只输出 Python 代码本身，不要输出任何解释、注释说明、Markdown 代码块、前后缀文字。
- 成功时：直接输出可运行的 Python 代码（def compute(data): ...）。
- 失败时：只输出四个字：${FACTOR_GENERATION_FAILURE}`,
});
