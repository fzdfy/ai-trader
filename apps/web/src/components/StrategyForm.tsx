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
  POSITION_SIZING_LABELS,
  type CreateStrategyInput,
  type CombineMode,
  type EntryType,
  type ExitType,
  type PositionSizing,
  type StopType,
  type TakeType,
  type SlippageType,
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
  stopType: "fixed",
  trailingStop: 10,
  atrStopMultiple: 2,
  takeType: "fixed",
  trailingTake: 10,
  maxLossPerTrade: 0,
  maxConsecutiveLosses: 0,
  entryType: "threshold",
  volumeConfirm: false,
  limitFilter: false,
  stFilter: false,
  marketFilter: false,
  exitType: "threshold",
  maxHoldingDays: 0,
  sizing: "fixed",
  baseSize: 95,
  maxSize: 95,
  totalCap: 100,
  maxPositions: 1,
  kellyFraction: 50,
  atrPeriod: 14,
  atrRiskBudget: 2,
  pyramiding: false,
  firstEntry: 50,
  addOnProfit: 5,
  addSize: 25,
  maxAdds: 2,
  partialExit: false,
  partialExitRatio: 50,
  commissionRate: 3,
  stampTaxRate: 10,
  transferFeeRate: 0.1,
  minCommission: 5,
  slippageType: "percent",
  slippageValue: 2,
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
  // 风控层：止损/止盈方式 + 移动止损/止盈 + 单笔最大亏损 + 连续亏损熔断
  const [stopType, setStopType] = useState<StopType>(iv.stopType);
  const [trailingStop, setTrailingStop] = useState(iv.trailingStop);
  const [atrStopMultiple, setAtrStopMultiple] = useState(iv.atrStopMultiple);
  const [takeType, setTakeType] = useState<TakeType>(iv.takeType);
  const [trailingTake, setTrailingTake] = useState(iv.trailingTake);
  const [maxLossPerTrade, setMaxLossPerTrade] = useState(iv.maxLossPerTrade);
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState(iv.maxConsecutiveLosses);
  // 入场层：入场方式 + 过滤开关
  const [entryType, setEntryType] = useState<EntryType>(iv.entryType);
  const [volumeConfirm, setVolumeConfirm] = useState(iv.volumeConfirm);
  const [limitFilter, setLimitFilter] = useState(iv.limitFilter);
  const [stFilter, setStFilter] = useState(iv.stFilter);
  const [marketFilter, setMarketFilter] = useState(iv.marketFilter);
  // 出场层：出场方式 + 持仓时间上限
  const [exitType, setExitType] = useState<ExitType>(iv.exitType);
  const [maxHoldingDays, setMaxHoldingDays] = useState(iv.maxHoldingDays);
  // 仓位层：计算方式 + 上限 + 凯利/ATR + 分批建仓/止盈
  const [sizing, setSizing] = useState<PositionSizing>(iv.sizing);
  const [baseSize, setBaseSize] = useState(iv.baseSize);
  const [maxSize, setMaxSize] = useState(iv.maxSize);
  const [totalCap, setTotalCap] = useState(iv.totalCap);
  const [maxPositions, setMaxPositions] = useState(iv.maxPositions);
  const [kellyFraction, setKellyFraction] = useState(iv.kellyFraction);
  const [atrPeriod, setAtrPeriod] = useState(iv.atrPeriod);
  const [atrRiskBudget, setAtrRiskBudget] = useState(iv.atrRiskBudget);
  const [pyramiding, setPyramiding] = useState(iv.pyramiding);
  const [firstEntry, setFirstEntry] = useState(iv.firstEntry);
  const [addOnProfit, setAddOnProfit] = useState(iv.addOnProfit);
  const [addSize, setAddSize] = useState(iv.addSize);
  const [maxAdds, setMaxAdds] = useState(iv.maxAdds);
  const [partialExit, setPartialExit] = useState(iv.partialExit);
  const [partialExitRatio, setPartialExitRatio] = useState(iv.partialExitRatio);
  // 成本层：佣金/印花税/过户费/最低佣金/滑点（费率为万分比，最低佣金与固定滑点为元）
  const [commissionRate, setCommissionRate] = useState(iv.commissionRate);
  const [stampTaxRate, setStampTaxRate] = useState(iv.stampTaxRate);
  const [transferFeeRate, setTransferFeeRate] = useState(iv.transferFeeRate);
  const [minCommission, setMinCommission] = useState(iv.minCommission);
  const [slippageType, setSlippageType] = useState<SlippageType>(iv.slippageType);
  const [slippageValue, setSlippageValue] = useState(iv.slippageValue);

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
      stopType,
      trailingStop,
      atrStopMultiple,
      takeType,
      trailingTake,
      maxLossPerTrade,
      maxConsecutiveLosses,
      entryType,
      volumeConfirm,
      limitFilter,
      stFilter,
      marketFilter,
      exitType,
      maxHoldingDays,
      sizing,
      baseSize,
      maxSize,
      totalCap,
      maxPositions,
      kellyFraction,
      atrPeriod,
      atrRiskBudget,
      pyramiding,
      firstEntry,
      addOnProfit,
      addSize,
      maxAdds,
      partialExit,
      partialExitRatio,
      commissionRate,
      stampTaxRate,
      transferFeeRate,
      minCommission,
      slippageType,
      slippageValue,
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
          <Text style={{ fontWeight: 600 }}>入场层</Text>
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
            <ConfigSlider
              label="入场阈值"
              value={entryThreshold}
              onChange={setEntryThreshold}
              hint="综合得分 ≥ 此值时买入"
            />
          </HStack>
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
          <Text style={{ fontWeight: 600 }}>出场层</Text>
          <SegmentedControl
            value={exitType}
            onChange={(v) => setExitType(v as ExitType)}
            label="出场方式"
            layout="hug"
          >
            <SegmentedControlItem value="threshold" label="阈值触发" />
            <SegmentedControlItem value="cross" label="下穿触发" />
          </SegmentedControl>
          <HStack gap={5} style={{ flexWrap: "wrap" }}>
            <ConfigSlider
              label="出场阈值"
              value={exitThreshold}
              onChange={setExitThreshold}
              hint="综合得分 ≤ 此值时卖出"
            />
            <ConfigSlider
              label="持仓时间上限"
              value={maxHoldingDays}
              onChange={setMaxHoldingDays}
              min={0}
              max={250}
              step={1}
              hint="超过此交易日数强制离场（0 表示不限）"
              valueFormatter={(v) => (v === 0 ? "不限" : `${v} 天`)}
            />
          </HStack>
        </VStack>
      </Section>

      <Section>
        <VStack gap={3}>
          <Text style={{ fontWeight: 600 }}>仓位层</Text>
          <SegmentedControl
            value={sizing}
            onChange={(v) => setSizing(v as PositionSizing)}
            label="仓位计算方式"
            layout="hug"
          >
            <SegmentedControlItem value="fixed" label="固定比例" />
            <SegmentedControlItem value="kelly" label="凯利公式" />
            <SegmentedControlItem value="atr" label="ATR 波动率" />
          </SegmentedControl>
          <HStack gap={5} style={{ flexWrap: "wrap" }}>
            <ConfigSlider
              label="基础目标仓位"
              value={baseSize}
              onChange={setBaseSize}
              hint="fixed 模式直接使用；kelly/atr 作为上限参考"
            />
            <ConfigSlider
              label="单票仓位硬上限"
              value={maxSize}
              onChange={setMaxSize}
              hint="限制单票最大暴露"
            />
            <ConfigSlider
              label="总仓位上限"
              value={totalCap}
              onChange={setTotalCap}
              hint="资金总投入比例上限"
            />
            <ConfigSlider
              label="最大持仓数量"
              value={maxPositions}
              onChange={setMaxPositions}
              min={1}
              max={50}
              step={1}
              hint="组合回测生效，单标的回测恒为 1"
              valueFormatter={(v) => `${v} 只`}
            />
          </HStack>

          {sizing === "kelly" && (
            <ConfigSlider
              label="凯利分数系数"
              value={kellyFraction}
              onChange={setKellyFraction}
              hint="半凯利=50，全凯利=100；基于历史交易胜率/盈亏比动态计算"
            />
          )}

          {sizing === "atr" && (
            <HStack gap={5} style={{ flexWrap: "wrap" }}>
              <ConfigSlider
                label="ATR 周期"
                value={atrPeriod}
                onChange={setAtrPeriod}
                min={5}
                max={60}
                step={1}
                hint="真实波幅均值窗口"
                valueFormatter={(v) => `${v} 根`}
              />
              <ConfigSlider
                label="ATR 风险预算"
                value={atrRiskBudget}
                onChange={setAtrRiskBudget}
                max={10}
                step={1}
                hint="单笔风险预算占净值%，波动大自动减仓"
              />
            </HStack>
          )}

          <VStack gap={3}>
            <Switch
              label="分批建仓（加仓）"
              description="浮盈后分批追加仓位，避免一次性满仓"
              value={pyramiding}
              onChange={setPyramiding}
            />
            {pyramiding && (
              <HStack gap={5} style={{ flexWrap: "wrap" }}>
                <ConfigSlider
                  label="首仓比例"
                  value={firstEntry}
                  onChange={setFirstEntry}
                  hint="首次买入占基础仓位的比例"
                />
                <ConfigSlider
                  label="每次加仓比例"
                  value={addSize}
                  onChange={setAddSize}
                  hint="每次加仓占基础仓位的比例"
                />
                <ConfigSlider
                  label="加仓触发浮盈"
                  value={addOnProfit}
                  onChange={setAddOnProfit}
                  max={50}
                  hint="浮盈达到此比例后触发加仓"
                />
                <ConfigSlider
                  label="最大加仓次数"
                  value={maxAdds}
                  onChange={setMaxAdds}
                  min={1}
                  max={10}
                  step={1}
                  valueFormatter={(v) => `${v} 次`}
                />
              </HStack>
            )}
          </VStack>

          <VStack gap={3}>
            <Switch
              label="分批止盈（减仓）"
              description="达到止盈线先部分减仓，剩余继续持有"
              value={partialExit}
              onChange={setPartialExit}
            />
            {partialExit && (
              <ConfigSlider
                label="止盈后保留比例"
                value={partialExitRatio}
                onChange={setPartialExitRatio}
                hint="达到止盈线后保留的仓位比例，剩余清仓"
              />
            )}
          </VStack>
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
          </HStack>

          <VStack gap={1}>
            <SegmentedControl
              value={stopType}
              onChange={(v) => setStopType(v as StopType)}
              label="止损方式"
              layout="hug"
            >
              <SegmentedControlItem value="fixed" label="固定百分比" />
              <SegmentedControlItem value="trailing" label="移动止损" />
              <SegmentedControlItem value="atr" label="ATR 止损" />
            </SegmentedControl>
          </VStack>

          {stopType === "fixed" && (
            <ConfigSlider
              label="止损线"
              value={stopLoss}
              onChange={setStopLoss}
              max={50}
              hint="回撤超过此比例止损离场"
            />
          )}
          {stopType === "trailing" && (
            <ConfigSlider
              label="移动止损回撤"
              value={trailingStop}
              onChange={setTrailingStop}
              max={50}
              hint="从持仓最高价回撤此比例触发止损"
            />
          )}
          {stopType === "atr" && (
            <ConfigSlider
              label="ATR 止损倍数"
              value={atrStopMultiple}
              onChange={setAtrStopMultiple}
              min={1}
              max={10}
              step={1}
              hint="止损价 = 入场价 - N × ATR"
              valueFormatter={(v) => `${v} 倍`}
            />
          )}

          <VStack gap={1}>
            <SegmentedControl
              value={takeType}
              onChange={(v) => setTakeType(v as TakeType)}
              label="止盈方式"
              layout="hug"
            >
              <SegmentedControlItem value="fixed" label="固定百分比" />
              <SegmentedControlItem value="trailing" label="移动止盈" />
            </SegmentedControl>
          </VStack>

          {takeType === "fixed" && (
            <ConfigSlider
              label="止盈线"
              value={takeProfit}
              onChange={setTakeProfit}
              hint="盈利达到此比例止盈离场"
            />
          )}
          {takeType === "trailing" && (
            <ConfigSlider
              label="移动止盈回撤"
              value={trailingTake}
              onChange={setTrailingTake}
              max={50}
              hint="从持仓最高价回撤此比例触发止盈"
            />
          )}

          <HStack gap={5} style={{ flexWrap: "wrap" }}>
            <ConfigSlider
              label="单笔最大亏损"
              value={maxLossPerTrade}
              onChange={setMaxLossPerTrade}
              max={50}
              hint="单笔亏损超此比例强制离场（0 表示不限）"
              valueFormatter={(v) => (v === 0 ? "不限" : `${v}%`)}
            />
            <ConfigSlider
              label="连续亏损熔断"
              value={maxConsecutiveLosses}
              onChange={setMaxConsecutiveLosses}
              min={0}
              max={20}
              step={1}
              hint="连续亏损达此次数后暂停开仓（0 表示不限）"
              valueFormatter={(v) => (v === 0 ? "不限" : `${v} 次`)}
            />
          </HStack>
        </VStack>
      </Section>

      <Section>
        <VStack gap={3}>
          <Text style={{ fontWeight: 600 }}>成本层</Text>
          <HStack gap={5} style={{ flexWrap: "wrap" }}>
            <ConfigSlider
              label="佣金费率"
              value={commissionRate}
              onChange={setCommissionRate}
              min={0}
              max={20}
              step={0.5}
              hint="按成交金额收取的佣金"
              valueFormatter={(v) => `万分之${v}`}
            />
            <ConfigSlider
              label="印花税"
              value={stampTaxRate}
              onChange={setStampTaxRate}
              min={0}
              max={20}
              step={0.5}
              hint="卖出时收取（默认千 1）"
              valueFormatter={(v) => `万分之${v}`}
            />
            <ConfigSlider
              label="过户费"
              value={transferFeeRate}
              onChange={setTransferFeeRate}
              min={0}
              max={5}
              step={0.1}
              hint="按成交金额收取的过户费"
              valueFormatter={(v) => `万分之${v}`}
            />
            <ConfigSlider
              label="最低佣金"
              value={minCommission}
              onChange={setMinCommission}
              min={0}
              max={20}
              step={0.5}
              hint="单笔佣金不足时按此金额收取"
              valueFormatter={(v) => `${v} 元`}
            />
          </HStack>

          <VStack gap={1}>
            <SegmentedControl
              value={slippageType}
              onChange={(v) => {
                const next = v as SlippageType;
                setSlippageType(next);
                // 切换滑点方式时重置为对应默认值，避免数值越界
                setSlippageValue(next === "percent" ? 2 : 0.2);
              }}
              label="滑点方式"
              layout="hug"
            >
              <SegmentedControlItem value="percent" label="按比例" />
              <SegmentedControlItem value="fixed" label="固定金额" />
            </SegmentedControl>
          </VStack>

          <ConfigSlider
            label={slippageType === "percent" ? "滑点比例" : "滑点金额"}
            value={slippageValue}
            onChange={setSlippageValue}
            min={0}
            max={slippageType === "percent" ? 20 : 5}
            step={slippageType === "percent" ? 0.5 : 0.1}
            hint={
              slippageType === "percent"
                ? "成交价按此比例上浮/下浮"
                : "每笔成交固定滑点金额"
            }
            valueFormatter={(v) => (slippageType === "percent" ? `万分之${v}` : `${v} 元`)}
          />
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
