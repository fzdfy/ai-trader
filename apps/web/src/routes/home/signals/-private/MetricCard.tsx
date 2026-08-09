import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";

interface MetricCardProps {
  label: string;
  value: string;
  /** 数值颜色（可选，如涨跌色/盈亏色） */
  color?: string;
}

/**
 * 指标卡 — 行情页通用（筹码分布 / 资金流向等）。
 * 统一视觉：muted 背景、圆角 token、等宽数字。
 */
export function MetricCard({ label, value, color }: MetricCardProps) {
  return (
    <VStack
      gap={1}
      className="tabular-nums"
      style={{
        padding: "var(--spacing-3)",
        background: "var(--color-background-muted)",
        borderRadius: "var(--radius-md)",
        minWidth: 140,
      }}
    >
      <Text type="supporting" size="sm">
        {label}
      </Text>
      <Text size="lg" style={{ fontWeight: 700, color }}>
        {value}
      </Text>
    </VStack>
  );
}
