import { useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Slider } from "@astryxdesign/core/Slider";
import { Switch } from "@astryxdesign/core/Switch";
import type { Factor } from "../hooks/useFactors";

/** 单个因子的可编辑配置（值 + 权重 + 方向） */
export interface FactorSelection {
  value: number;
  weight: number;
  direction?: 1 | -1; // 方向覆盖：-1 反转因子得分
}

/** 因子选择行：开关 + 值 + 权重，用于创建/编辑策略时自由组合因子 */
export function FactorSelectRow({
  factor,
  selection,
  onToggle,
  onChange,
}: {
  factor: Factor;
  selection?: FactorSelection;
  onToggle: () => void;
  onChange: (patch: Partial<FactorSelection>) => void;
}) {
  const enabled = selection != null;
  const value = selection?.value ?? 50;
  const weight = selection?.weight ?? 0;
  const direction = selection?.direction ?? 1;

  const hint = useMemo(() => (factor.description ? factor.description : factor.name), [factor]);

  return (
    <VStack gap={2} style={{ padding: "var(--spacing-2) 0" }}>
      <HStack gap={4} align="center">
        <Switch
          label={factor.label}
          value={enabled}
          onChange={onToggle}
          labelPosition="start"
          labelSpacing="spread"
          style={{ width: 200 }}
        />
        <Text type="supporting" size="sm" style={{ flex: 1, minWidth: 100 }}>
          {hint}
        </Text>
      </HStack>

      {enabled && (
        <HStack gap={5} style={{ paddingInlineStart: "var(--spacing-5)" }}>
          <VStack gap={1} style={{ width: 220 }}>
            <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
              <Text type="supporting" size="sm">
                值
              </Text>
              <Text size="sm" style={{ fontWeight: 600 }}>
                {value}
              </Text>
            </HStack>
            <Slider
              label={`${factor.label} 值`}
              isLabelHidden
              value={value}
              onChange={(v: number) => onChange({ value: v })}
              min={0}
              max={100}
              step={1}
              valueDisplay="none"
            />
          </VStack>

          <VStack gap={1} style={{ width: 220 }}>
            <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
              <Text type="supporting" size="sm">
                权重
              </Text>
              <Text size="sm" style={{ fontWeight: 600 }}>
                {weight}%
              </Text>
            </HStack>
            <Slider
              label={`${factor.label} 权重`}
              isLabelHidden
              value={weight}
              onChange={(v: number) => onChange({ weight: v })}
              min={0}
              max={100}
              step={1}
              valueDisplay="none"
            />
          </VStack>

          <VStack gap={1} style={{ width: 160 }}>
            <Text type="supporting" size="sm">
              方向
            </Text>
            <Switch
              label="反向信号"
              value={direction === -1}
              onChange={(reversed: boolean) => onChange({ direction: reversed ? -1 : 1 })}
            />
            <Text type="supporting" size="sm">
              {direction === -1 ? "已反转" : "正向"}
            </Text>
          </VStack>
        </HStack>
      )}
    </VStack>
  );
}
