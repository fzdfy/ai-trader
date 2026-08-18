import { useEffect, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Switch } from "@astryxdesign/core/Switch";
import { Section } from "@astryxdesign/core/Section";
import type { Factor } from "../hooks/useFactors";
import type { Strategy, UpdateStrategyInput } from "../hooks/useStrategies";
import { FactorSelectRow, type FactorSelection } from "./FactorSelectRow";

interface StrategyEditDialogProps {
  strategy: Strategy | null;
  factors: Factor[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: UpdateStrategyInput) => void;
}

/**
 * 编辑策略弹框：name + description + 是否公开 + 自由组合因子（值、权重）。
 */
export function StrategyEditDialog({
  strategy,
  factors,
  isOpen,
  onOpenChange,
  onSubmit,
}: StrategyEditDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  // 因子名 → { value, weight }
  const [selected, setSelected] = useState<Record<string, FactorSelection>>({});

  // 每次打开时用当前策略数据预填表单
  useEffect(() => {
    if (isOpen && strategy) {
      setName(strategy.name);
      setDescription(strategy.description ?? "");
      setIsPublic(strategy.isPublic);
      const next: Record<string, FactorSelection> = {};
      for (const f of strategy.configJson?.factors ?? []) {
        next[f.name] = { value: f.value, weight: f.weight };
      }
      setSelected(next);
    }
  }, [isOpen, strategy]);

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
    if (!strategy || !name.trim() || selectedCount === 0) return;
    onSubmit({
      id: strategy.id,
      name: name.trim(),
      description: description.trim(),
      factors: Object.entries(selected).map(([factorName, sel]) => ({
        name: factorName,
        value: sel.value,
        weight: sel.weight,
      })),
      isPublic,
    });
    onOpenChange(false);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={640} maxHeight="85vh">
      <Layout
        header={<DialogHeader title="编辑策略" subtitle="修改名称、描述、因子组合与可见性" onOpenChange={onOpenChange} />}
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

              <Switch
                label="是否公开"
                description="开启后其他用户也能看到该策略"
                value={isPublic}
                onChange={setIsPublic}
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
                label="保存"
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
