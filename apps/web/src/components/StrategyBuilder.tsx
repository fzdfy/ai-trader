import { useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Slider } from "@astryxdesign/core/Slider";
import { Switch } from "@astryxdesign/core/Switch";
import { Section } from "@astryxdesign/core/Section";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import type { EntryType } from "../hooks/useStrategies";

// 因子元数据（对齐 quant 服务 GET /api/v1/factors 返回结构）
export interface FactorMeta {
  name: string;
  label: string;
  category: string;
  direction: number;
  description: string;
}

// 因子分类中文名（category 为 quant 注册表中的英文 key）
const CATEGORY_LABELS: Record<string, string> = {
  momentum: "动量",
  trend: "趋势",
  volume: "成交量",
  volatility: "波动",
};

interface StrategyBuilderProps {
  factors: FactorMeta[];
  /** 因子名 → 权重（0-100 百分比，前端展示用，提交时归一化到 1.0） */
  weights: Record<string, number>;
  onToggleFactor: (name: string) => void;
  onWeightChange: (name: string, weight: number) => void;
  /** 入场阈值（0-100） */
  entryThreshold: number;
  onEntryThresholdChange: (value: number) => void;
  /** 出场阈值（0-100） */
  exitThreshold: number;
  onExitThresholdChange: (value: number) => void;
  /** 仓位比例（0-100） */
  positionSize: number;
  onPositionSizeChange: (value: number) => void;
  /** 止损线（0-100） */
  stopLoss: number;
  onStopLossChange: (value: number) => void;
  /** 止盈线（0-100） */
  takeProfit: number;
  onTakeProfitChange: (value: number) => void;
  /** 入场方式 */
  entryType: EntryType;
  onEntryTypeChange: (value: EntryType) => void;
  /** 量能确认 */
  volumeConfirm: boolean;
  onVolumeConfirmChange: (value: boolean) => void;
  /** 涨跌停过滤 */
  limitFilter: boolean;
  onLimitFilterChange: (value: boolean) => void;
  /** ST 过滤 */
  stFilter: boolean;
  onStFilterChange: (value: boolean) => void;
  /** 大盘过滤 */
  marketFilter: boolean;
  onMarketFilterChange: (value: boolean) => void;
}

/** 阈值 / 风险滑杆行（供回测构建器与策略创建/编辑弹框复用） */
export function ConfigSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  hint,
  unit = "%",
  valueFormatter,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  unit?: string;
  valueFormatter?: (value: number) => string;
}) {
  return (
    <VStack gap={2} style={{ flex: 1, minWidth: 200 }}>
      <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
        <Text size="sm" style={{ fontWeight: 600 }}>
          {label}
        </Text>
        <Text type="supporting" size="sm">
          {valueFormatter ? valueFormatter(value) : `${value}${unit}`}
        </Text>
      </HStack>
      <Slider
        label={label}
        isLabelHidden
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        valueDisplay="none"
      />
      {hint ? (
        <Text type="supporting" size="sm">
          {hint}
        </Text>
      ) : null}
    </VStack>
  );
}

/** 单个因子行：开关 + 描述 + 权重滑杆 */
function FactorRow({
  factor,
  weight,
  onToggle,
  onWeightChange,
}: {
  factor: FactorMeta;
  weight: number;
  onToggle: () => void;
  onWeightChange: (weight: number) => void;
}) {
  const enabled = weight > 0;
  return (
    <HStack gap={4} align="center" style={{ padding: "var(--spacing-2) 0" }}>
      <Switch
        label={factor.label}
        value={enabled}
        onChange={onToggle}
        labelPosition="start"
        labelSpacing="spread"
        style={{ width: 200 }}
      />
      <Text type="supporting" size="sm" style={{ flex: 1, minWidth: 120 }}>
        {factor.description}
      </Text>
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
          onChange={onWeightChange}
          min={0}
          max={100}
          step={1}
          isDisabled={!enabled}
          valueDisplay="none"
        />
      </VStack>
    </HStack>
  );
}

/**
 * 多因子策略构建器（自定义策略模式）。
 *
 * 让用户勾选因子并分配权重、配置信号阈值与风控参数，
 * 最终由父组件在提交时拼装成 quant 服务 composite 策略所需的 config JSON。
 */
export function StrategyBuilder(props: StrategyBuilderProps) {
  const {
    factors,
    weights,
    onToggleFactor,
    onWeightChange,
    entryThreshold,
    onEntryThresholdChange,
    exitThreshold,
    onExitThresholdChange,
    positionSize,
    onPositionSizeChange,
    stopLoss,
    onStopLossChange,
    takeProfit,
    onTakeProfitChange,
    entryType,
    onEntryTypeChange,
    volumeConfirm,
    onVolumeConfirmChange,
    limitFilter,
    onLimitFilterChange,
    stFilter,
    onStFilterChange,
    marketFilter,
    onMarketFilterChange,
  } = props;

  // 按分类分组因子（保持 quant 注册表返回顺序）
  const grouped = useMemo(() => {
    const map = new Map<string, FactorMeta[]>();
    for (const f of factors) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return Array.from(map.entries());
  }, [factors]);

  const totalWeight = useMemo(
    () => Object.values(weights).reduce((sum, w) => sum + w, 0),
    [weights],
  );

  return (
    <VStack gap={5}>
      {/* 因子选择 */}
      <Section>
        <VStack gap={4}>
          <HStack gap={3} align="center" style={{ justifyContent: "space-between" }}>
            <VStack gap={1}>
              <Text style={{ fontWeight: 600 }}>因子选择</Text>
              <Text type="supporting" size="sm">
                勾选参与打分的因子并分配权重，权重将自动归一化到 100%
              </Text>
            </VStack>
            <Text size="sm" style={{ fontWeight: 600 }}>
              已选权重合计：{totalWeight}%
            </Text>
          </HStack>

          {grouped.map(([category, list]) => (
            <VStack key={category} gap={1}>
              <Text type="supporting" size="sm" style={{ fontWeight: 600 }}>
                {CATEGORY_LABELS[category] ?? category}
              </Text>
              {list.map((f) => (
                <FactorRow
                  key={f.name}
                  factor={f}
                  weight={weights[f.name] ?? 0}
                  onToggle={() => onToggleFactor(f.name)}
                  onWeightChange={(w) => onWeightChange(f.name, w)}
                />
              ))}
            </VStack>
          ))}
        </VStack>
      </Section>

      {/* 信号阈值 */}
      <Section>
        <VStack gap={4}>
          <Text style={{ fontWeight: 600 }}>信号阈值</Text>
          <HStack gap={5} style={{ flexWrap: "wrap" }}>
            <ConfigSlider
              label="入场阈值"
              value={entryThreshold}
              onChange={onEntryThresholdChange}
              hint="综合得分 ≥ 此值时买入"
            />
            <ConfigSlider
              label="出场阈值"
              value={exitThreshold}
              onChange={onExitThresholdChange}
              hint="综合得分 ≤ 此值时卖出"
            />
          </HStack>
        </VStack>
      </Section>

      {/* 入场过滤 */}
      <Section>
        <VStack gap={4}>
          <Text style={{ fontWeight: 600 }}>入场过滤</Text>
          <SegmentedControl
            value={entryType}
            onChange={(v) => onEntryTypeChange(v as EntryType)}
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
              onChange={onVolumeConfirmChange}
            />
            <Switch
              label="涨跌停过滤"
              description="涨停/跌停当日不买入"
              value={limitFilter}
              onChange={onLimitFilterChange}
            />
            <Switch
              label="ST 过滤"
              description="过滤 ST/*ST 标的"
              value={stFilter}
              onChange={onStFilterChange}
            />
            <Switch
              label="大盘过滤"
              description="大盘走弱时不买入"
              value={marketFilter}
              onChange={onMarketFilterChange}
            />
          </HStack>
        </VStack>
      </Section>

      {/* 风险管理 */}
      <Section>
        <VStack gap={4}>
          <Text style={{ fontWeight: 600 }}>风险管理</Text>
          <HStack gap={5} style={{ flexWrap: "wrap" }}>
            <ConfigSlider
              label="仓位比例"
              value={positionSize}
              onChange={onPositionSizeChange}
              hint="单笔投入资金占比"
            />
            <ConfigSlider
              label="止损线"
              value={stopLoss}
              onChange={onStopLossChange}
              max={50}
              hint="回撤超过此比例止损离场"
            />
            <ConfigSlider
              label="止盈线"
              value={takeProfit}
              onChange={onTakeProfitChange}
              hint="盈利达到此比例止盈离场"
            />
          </HStack>
        </VStack>
      </Section>
    </VStack>
  );
}
