import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Code } from "@astryxdesign/core/Code";
import {
  AKQUANT_COLUMNS,
  AKQUANT_OPERATOR_GROUPS,
  AKQUANT_SYNTAX,
} from "../lib/akquantFactors";

/**
 * AKQuant 因子表达式参考卡片（作为 HoverCard 的 content）。
 * 列出全部内置算子、列与语法。
 */
export function FactorExpressionReference() {
  return (
    <Card padding={4} style={{ maxWidth: 520, maxHeight: 480, overflowY: "auto" }}>
      <VStack gap={3}>
        <Text weight="semibold">AKQuant 因子表达式</Text>
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
