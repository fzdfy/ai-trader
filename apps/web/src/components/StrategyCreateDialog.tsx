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
import {
  COMBINE_MODES,
  COMBINE_LABELS,
  type CreateStrategyInput,
  type CombineMode,
} from "../hooks/useStrategies";
import { FactorSelectRow, type FactorSelection } from "./FactorSelectRow";
import { ConfigSlider } from "./StrategyBuilder";

interface StrategyCreateDialogProps {
  isOpen: boolean;
  factors: Factor[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateStrategyInput) => void;
}

/**
 * 创建策略弹框：name + description + 是否公开 + 自由组合因子（值、权重）。
 */
export function StrategyCreateDialog({
  isOpen,
  factors,
  onOpenChange,
  onSubmit,
}: StrategyCreateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  // 信号合成方式
  const [combine, setCombine] = useState<CombineMode>("weighted_sum");
  // 因子名 → { value, weight, direction }
  const [selected, setSelected] = useState<Record<string, FactorSelection>>({});
  // 入场/出场阈值与仓位/止盈/止损（0-100 百分比）
  const [entryThreshold, setEntryThreshold] = useState(65);
  const [exitThreshold, setExitThreshold] = useState(30);
  const [positionSize, setPositionSize] = useState(95);
  const [stopLoss, setStopLoss] = useState(8);
  const [takeProfit, setTakeProfit] = useState(20);

  // 每次打开时重置表单
  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setIsPublic(false);
      setCombine("weighted_sum");
      setSelected({});
      setEntryThreshold(65);
      setExitThreshold(30);
      setPositionSize(95);
      setStopLoss(8);
      setTakeProfit(20);
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
  // 因子权重为百分比（0-100），归一化后权重和须等于 1（即合计 100%）
  const totalWeight = Object.values(selected).reduce((sum, sel) => sum + sel.weight, 0);
  const weightsValid = totalWeight === 100;

  const handleSubmit = () => {
    if (!name.trim() || selectedCount === 0 || !weightsValid) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      factors: Object.entries(selected).map(([factorName, sel]) => ({
        name: factorName,
        value: sel.value,
        weight: sel.weight,
        direction: sel.direction ?? 1,
      })),
      combine,
      entry: entryThreshold,
      exit: exitThreshold,
      positionSize,
      stopLoss,
      takeProfit,
      isPublic,
    });
    onOpenChange(false);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={640} maxHeight="85vh">
      <Layout
        header={<DialogHeader title="创建策略" subtitle="组合因子并配置入场/出场与风控参数" onOpenChange={onOpenChange} />}
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
                      已选 {selectedCount} 个因子 · 权重合计 {totalWeight}%
                    </Text>
                  </HStack>
                  <VStack gap={1}>
                    <Text type="supporting" size="sm">
                      信号合成方式
                    </Text>
                    <select
                      value={combine}
                      onChange={(e) => setCombine(e.target.value as CombineMode)}
                      style={{
                        height: 36,
                        padding: "0 8px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface)",
                        color: "var(--color-text)",
                        width: 240,
                      }}
                    >
                      {COMBINE_MODES.map((m) => (
                        <option key={m} value={m}>
                          {COMBINE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </VStack>
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
                  {selectedCount > 0 && !weightsValid && (
                    <Text type="supporting" size="sm">
                      因子权重合计需为 100%，当前为 {totalWeight}%
                    </Text>
                  )}
                </VStack>
              </Section>

              <Section>
                <VStack gap={3}>
                  <Text style={{ fontWeight: 600 }}>信号阈值</Text>
                  <HStack gap={5} style={{ flexWrap: "wrap" }}>
                    <ConfigSlider
                      label="入场阈值"
                      value={entryThreshold}
                      onChange={setEntryThreshold}
                      hint="综合得分 ≥ 此值时买入"
                    />
                    <ConfigSlider
                      label="出场阈值"
                      value={exitThreshold}
                      onChange={setExitThreshold}
                      hint="综合得分 ≤ 此值时卖出"
                    />
                  </HStack>
                </VStack>
              </Section>

              <Section>
                <VStack gap={3}>
                  <Text style={{ fontWeight: 600 }}>风险管理</Text>
                  <HStack gap={5} style={{ flexWrap: "wrap" }}>
                    <ConfigSlider
                      label="仓位比例"
                      value={positionSize}
                      onChange={setPositionSize}
                      hint="单笔投入资金占比"
                    />
                    <ConfigSlider
                      label="止损线"
                      value={stopLoss}
                      onChange={setStopLoss}
                      max={50}
                      hint="回撤超过此比例止损离场"
                    />
                    <ConfigSlider
                      label="止盈线"
                      value={takeProfit}
                      onChange={setTakeProfit}
                      hint="盈利达到此比例止盈离场"
                    />
                  </HStack>
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
                isDisabled={!name.trim() || selectedCount === 0 || !weightsValid}
                onClick={handleSubmit}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
