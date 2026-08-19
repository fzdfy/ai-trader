import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { Switch } from "@astryxdesign/core/Switch";
import { Section } from "@astryxdesign/core/Section";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import type { Factor } from "../hooks/useFactors";
import {
  COMBINE_MODES,
  COMBINE_LABELS,
  type CreateStrategyInput,
  type CombineMode,
  type EntryType,
} from "../hooks/useStrategies";
import { FactorSelectRow, type FactorSelection } from "./FactorSelectRow";
import { ConfigSlider } from "./StrategyBuilder";

/** 创建策略时的默认表单值（页面版，无弹框，挂载即生效） */
const DEFAULT_VALUES: CreateStrategyInput = {
  name: "",
  description: "",
  isPublic: false,
  factors: [],
  combine: "weighted_sum",
  entry: 65,
  exit: 30,
  positionSize: 95,
  stopLoss: 8,
  takeProfit: 20,
  entryType: "threshold",
  volumeConfirm: false,
  limitFilter: false,
  stFilter: false,
  marketFilter: false,
};

interface StrategyFormProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  factors: Factor[];
  /** 编辑时的预填值；不传则使用默认值（创建模式） */
  initialValues?: CreateStrategyInput;
  isSubmitting?: boolean;
  onSubmit: (values: CreateStrategyInput) => void;
  onCancel: () => void;
}

/**
 * 创建/编辑策略共用的表单页面内容。
 * 创建与编辑共享同一套字段：名称、描述、是否公开、因子组合（值/权重/方向）、
 * 信号合成方式、信号阈值、入场过滤、风险管理。
 */
export function StrategyForm({
  title,
  subtitle,
  submitLabel,
  factors,
  initialValues,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: StrategyFormProps) {
  const iv = initialValues ?? DEFAULT_VALUES;
  const [name, setName] = useState(iv.name);
  const [description, setDescription] = useState(iv.description);
  const [isPublic, setIsPublic] = useState(iv.isPublic);
  // 信号合成方式
  const [combine, setCombine] = useState<CombineMode>(iv.combine);
  // 因子名 → { value, weight, direction }
  const [selected, setSelected] = useState<Record<string, FactorSelection>>(() => {
    const next: Record<string, FactorSelection> = {};
    for (const f of iv.factors) {
      next[f.name] = { value: f.value, weight: f.weight, direction: f.direction ?? 1 };
    }
    return next;
  });
  // 入场/出场阈值与仓位/止盈/止损（0-100 百分比）
  const [entryThreshold, setEntryThreshold] = useState(iv.entry);
  const [exitThreshold, setExitThreshold] = useState(iv.exit);
  const [positionSize, setPositionSize] = useState(iv.positionSize);
  const [stopLoss, setStopLoss] = useState(iv.stopLoss);
  const [takeProfit, setTakeProfit] = useState(iv.takeProfit);
  // 入场层：入场方式 + 过滤开关
  const [entryType, setEntryType] = useState<EntryType>(iv.entryType);
  const [volumeConfirm, setVolumeConfirm] = useState(iv.volumeConfirm);
  const [limitFilter, setLimitFilter] = useState(iv.limitFilter);
  const [stFilter, setStFilter] = useState(iv.stFilter);
  const [marketFilter, setMarketFilter] = useState(iv.marketFilter);

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
  const canSubmit = name.trim().length > 0 && selectedCount > 0 && weightsValid && !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      isPublic,
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
      entryType,
      volumeConfirm,
      limitFilter,
      stFilter,
      marketFilter,
    });
  };

  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        <Text type="supporting">{subtitle}</Text>
      </VStack>

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
          <Text style={{ fontWeight: 600 }}>入场过滤</Text>
          <SegmentedControl
            value={entryType}
            onChange={(v) => setEntryType(v as EntryType)}
            label="入场方式"
            layout="hug"
          >
            <SegmentedControlItem value="threshold" label="阈值触发" />
            <SegmentedControlItem value="cross" label="上穿触发" />
          </SegmentedControl>
          <HStack gap={5} style={{ flexWrap: "wrap" }}>
            <Switch
              label="量能确认"
              description="当前量 ≥ 前5日均量×1.5"
              value={volumeConfirm}
              onChange={setVolumeConfirm}
            />
            <Switch
              label="涨跌停过滤"
              description="涨停/跌停当日不买入"
              value={limitFilter}
              onChange={setLimitFilter}
            />
            <Switch
              label="ST 过滤"
              description="过滤 ST/*ST 标的"
              value={stFilter}
              onChange={setStFilter}
            />
            <Switch
              label="大盘过滤"
              description="大盘走弱时不买入"
              value={marketFilter}
              onChange={setMarketFilter}
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

      <HStack gap={2} align="center" style={{ justifyContent: "flex-end" }}>
        <Button label="取消" variant="ghost" onClick={onCancel} isDisabled={isSubmitting} />
        <Button
          label={submitLabel}
          variant="primary"
          isDisabled={!canSubmit}
          isLoading={isSubmitting}
          onClick={handleSubmit}
        />
      </HStack>
    </VStack>
  );
}
