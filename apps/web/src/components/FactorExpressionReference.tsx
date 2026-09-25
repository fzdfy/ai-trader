import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Code } from "@astryxdesign/core/Code";
import {
  AKQUANT_COLUMNS,
  AKQUANT_FACTOR_EXPRESSIONS,
  AKQUANT_FACTOR_LABELS,
  AKQUANT_OPERATOR_GROUPS,
  AKQUANT_SYNTAX,
} from "../lib/akquantFactors";

/** 可直接运行的示例表达式与其对应策略 */
const EXPRESSION_SAMPLE = "Close / Ref(Close, 5) - 1";

/**
 * AKQuant 因子表达式参考卡片（作为 HoverCard 的 content）。
 * 给出可运行示例与策略说明，并列出内置因子、全部算子、列与语法。
 */
export function FactorExpressionReference() {
  return (
    <Card padding={4} style={{ maxWidth: 520, maxHeight: 480, overflowY: "auto" }}>
      <VStack gap={3}>
        <Text weight="semibold">AKQuant 因子表达式</Text>

        <VStack gap={1}>
          <Text size="sm" weight="semibold">
            示例策略：5 日动量（ROC）
          </Text>
          <Text size="sm" type="supporting">
            近 5 个交易日的涨跌幅，值越大代表短期动能越强。该示例可直接运行。
          </Text>
          <Text size="sm" style={{ fontFamily: "var(--font-family-code)", whiteSpace: "pre" }}>
            {EXPRESSION_SAMPLE}
          </Text>
        </VStack>

        <Text size="sm" type="supporting">
          可用列：{AKQUANT_COLUMNS.join(" / ")}
        </Text>

        {AKQUANT_OPERATOR_GROUPS.map((group) => (
          <VStack key={group.label} gap={1}>
            <Text size="sm" weight="semibold">
              {group.label}
            </Text>
            {group.operators.map((op) => (
              <Text key={op.signature} size="sm">
                <Code>{op.signature}</Code> {op.description}
                {op.alias ? `（别名 ${op.alias}）` : ""}
              </Text>
            ))}
          </VStack>
        ))}

        <VStack gap={1}>
          <Text size="sm" weight="semibold">
            内置因子（可直接复用的表达式）
          </Text>
          {Object.entries(AKQUANT_FACTOR_EXPRESSIONS).map(([name, expression]) => (
            <Text key={name} size="sm">
              <Code>{name}</Code>
              {AKQUANT_FACTOR_LABELS[name] ? ` ${AKQUANT_FACTOR_LABELS[name]}：` : "："}
              <Code>{expression}</Code>
            </Text>
          ))}
        </VStack>

        <VStack gap={1}>
          <Text size="sm" weight="semibold">
            语法
          </Text>
          {AKQUANT_SYNTAX.map((s) => (
            <Text key={s} size="sm" type="supporting">
              {s}
            </Text>
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}
