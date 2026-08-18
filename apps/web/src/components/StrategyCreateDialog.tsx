import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Slider } from "@astryxdesign/core/Slider";
import { Switch } from "@astryxdesign/core/Switch";
import { Section } from "@astryxdesign/core/Section";
import type { Factor } from "../hooks/useFactors";
import type { CreateStrategyInput } from "../hooks/useStrategies";

interface StrategyCreateDialogProps {
  isOpen: boolean;
  factors: Factor[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateStrategyInput) => void;
}

/** 单个因子的可编辑配置（值 + 权重） */
interface FactorSelection {
  value: number;
  weight: number;
}

/**
 * 创建策略弹框：name + description + 自由组合因子（值、权重）。
 */
export function StrategyCreateDialog({
  isOpen,
  factors,
  onOpenChange,
  onSubmit,
}: StrategyCreateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // 因子名 → { value, weight }
  const [selected, setSelected] = useState<Record<string, FactorSelection>>({});

  // 每次打开时重置表单
  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setSelected({});
    }
  }, [isOpen]);

  const toggleFactor = (factorName: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[factorName]) {
        delete next[factorName];
      } else {
        next[factorName] = { value: 50, weight: 20 };
      }
      return next;
    });
  };

  const updateSelection = (factorName: string, patch: Partial<FactorSelection>) => {
    setSelected((prev) => {
      const current = prev[factorName] ?? { value: 0, weight: 0 };
      const next = { ...prev };
      next[factorName] = { ...current, ...patch };
      return next;
    });
  };

  const selectedCount = Object.keys(selected).length;

  const handleSubmit = () => {
    if (!name.trim() || selectedCount === 0) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      factors: Object.entries(selected).map(([factorName, sel]) => ({
        name: factorName,
        value: sel.value,
        weight: sel.weight,
      })),
    });
    onOpenChange(false);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={640} maxHeight="85vh">
      <Layout
        header={<DialogHeader title="创建策略" subtitle="组合因子并分配值、权重" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={4}>
              <TextInput
                label="名称"
                value={name}
                onChange={setName}
                isRequired
                placeholder="如：均线动量策略"
                hasAutoFocus
              />
              <TextArea
                label="描述"
                value={description}
                onChange={setDescription}
                placeholder="简要说明该策略的思路"
              />

              <Section>
                <VStack gap={3}>
                  <HStack gap={3} align="center" style={{ justifyContent: "space-between" }}>
                    <Text style={{ fontWeight: 600 }}>因子组合</Text>
                    <Text type="supporting" size="sm">
                      已选 {selectedCount} 个因子
                    </Text>
                  </HStack>
                  {factors.length === 0 ? (
                    <Text type="supporting" size="sm">
                      暂无可用因子
                    </Text>
                  ) : (
                    factors.map((factor) => (
                      <FactorSelectRow
                        key={factor.name}
                        factor={factor}
                        selection={selected[factor.name]}
                        onToggle={() => toggleFactor(factor.name)}
                        onChange={(patch) => updateSelection(factor.name, patch)}
                      />
                    ))
                  )}
                </VStack>
              </Section>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} align="center" style={{ justifyContent: "flex-end" }}>
              <Button label="取消" variant="ghost" onClick={() => onOpenChange(false)} />
              <Button
                label="创建"
                variant="primary"
                isDisabled={!name.trim() || selectedCount === 0}
                onClick={handleSubmit}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

/** 因子选择行：开关 + 值 + 权重 */
function FactorSelectRow({
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
        </HStack>
      )}
    </VStack>
  );
}
