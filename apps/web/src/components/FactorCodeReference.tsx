import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Code } from "@astryxdesign/core/Code";

/**
 * Python 因子示例代码。
 * 入口固定为 compute(data)，返回与输入等长的因子值序列（系统会做横截面归一化）。
 */
export const PYTHON_FACTOR_TEMPLATE = `def compute(data):
    close = data["close"]
    window = 20
    out = np.full(len(close), np.nan)
    for i in range(window - 1, len(close)):
        ma = np.mean(close[i - window + 1 : i + 1])
        out[i] = close[i] / ma - 1
    return out`;

/** data 字典中可直接读取的行情列 */
const FACTOR_CODE_COLUMNS = [
  { key: "open", label: "开盘价" },
  { key: "high", label: "最高价" },
  { key: "low", label: "最低价" },
  { key: "close", label: "收盘价" },
  { key: "volume", label: "成交量" },
  { key: "amount", label: "成交额" },
];

/** Python 因子的运行约束 */
const FACTOR_CODE_RULES = [
  "入口函数必须为 def compute(data)，返回标量或与输入等长的数值序列。",
  "data 为字典，值为 numpy 数组，可直接下标读取。",
  "可用 np（numpy）与 math，以及 abs、min、max、sum、len、range、round、sorted 等安全内置函数。",
  "禁止 import、双下划线名称、eval / exec / open 等危险调用，代码不超过 5000 字符。",
  "返回值由系统做横截面百分位归一化到 0-1，无需自行归一化。",
  "执行受限且带超时保护，请避免死循环与超大计算。",
];

/**
 * Python 因子参考卡片（作为 HoverCard 的 content）。
 * 说明 compute(data) 契约、可用数据列、受限运行环境与示例代码。
 */
export function FactorCodeReference() {
  return (
    <Card padding={4} style={{ maxWidth: 520, maxHeight: 480, overflowY: "auto" }}>
      <VStack gap={3}>
        <Text weight="semibold">Python 因子</Text>

        <Text size="sm">
          需定义 <Code>compute(data)</Code> 函数，返回与输入等长的因子值序列。
        </Text>

        {FACTOR_CODE_RULES.map((rule) => (
          <Text key={rule} size="sm" type="supporting">
            {rule}
          </Text>
        ))}

        <VStack gap={1}>
          <Text size="sm" weight="semibold">
            可用数据列
          </Text>
          {FACTOR_CODE_COLUMNS.map((col) => (
            <Text key={col.key} size="sm">
              <Code>data["{col.key}"]</Code> {col.label}
            </Text>
          ))}
        </VStack>

        <VStack gap={1}>
          <Text size="sm" weight="semibold">
            示例策略：20 日乖离率
          </Text>
          <Text size="sm" type="supporting">
            收盘价相对 20 日均线的偏离度（乖离率）：值越大越超买、越小越超卖。该示例可直接运行。
          </Text>
          <Text
            size="sm"
            style={{ fontFamily: "var(--font-family-code)", whiteSpace: "pre" }}
          >
            {PYTHON_FACTOR_TEMPLATE}
          </Text>
        </VStack>
      </VStack>
    </Card>
  );
}
