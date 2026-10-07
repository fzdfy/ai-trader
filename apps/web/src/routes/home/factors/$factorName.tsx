import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Card } from "@astryxdesign/core/Card";
import { Switch } from "@astryxdesign/core/Switch";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { DateInput } from "@astryxdesign/core/DateInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { Table, proportional } from "@astryxdesign/core/Table";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog";
import { PythonCodeEditor } from "../../../components/PythonCodeEditor";
import { ExpressionCodeEditor } from "../../../components/ExpressionCodeEditor";
import { FactorIcChart } from "../../../components/charts/FactorIcChart";
import { FactorLayerChart } from "../../../components/charts/FactorLayerChart";
import { FactorDecayChart } from "../../../components/charts/FactorDecayChart";
import { FactorMonthlyIcChart } from "../../../components/charts/FactorMonthlyIcChart";
import { summarizeDecay, formatHalfLife } from "../../../lib/factorDecay";
import { authClient } from "../../../lib/auth-client";
import { AKQUANT_FACTOR_EXPRESSIONS } from "../../../lib/akquantFactors";
import {
  useFactorQuery,
  useUpdateFactor,
  useDeleteFactor,
  useFactorEvaluation,
  normalizeFactorKind,
  formatFactorCategory,
  FACTOR_KIND_LABELS,
  type FactorEditDraft,
} from "../../../hooks/useFactors";

export const Route = createFileRoute("/home/factors/$factorName")({
  component: FactorDetailPage,
});

/** 数值格式化：null / 非有限值显示占位符 */
const formatNum = (value: number | null | undefined, digits = 4): string =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

/** 比例格式化（入参为 0~1 小数） */
const formatPct = (value: number | null | undefined, digits = 2): string =>
  value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`;

/** PIT 基准日上限（今天，ISO 日期）：不允许把复权快照基准选到未来 */
const TODAY_ISO = new Date().toISOString().slice(0, 10) as ISODateString;

type LayerRow = Record<string, unknown> & {
  key: string;
  name: string;
  cumRet: number;
  annRet: number | null;
  winRate: number | null;
  days: number;
};

const LAYER_COLUMNS = [
  { key: "name" as const, header: "组合", width: proportional(2) },
  {
    key: "cumRet" as const,
    header: "累计收益",
    width: proportional(1),
    renderCell: (row: LayerRow) => <Text>{formatPct(row.cumRet)}</Text>,
  },
  {
    key: "annRet" as const,
    header: "年化收益",
    width: proportional(1),
    renderCell: (row: LayerRow) => <Text>{formatPct(row.annRet)}</Text>,
  },
  {
    key: "winRate" as const,
    header: "胜率",
    width: proportional(1),
    renderCell: (row: LayerRow) => <Text>{formatPct(row.winRate, 1)}</Text>,
  },
  { key: "days" as const, header: "天数", width: proportional(1) },
];

type DecayRow = Record<string, unknown> & {
  horizon: number;
  icMean: number | null;
  rankIcMean: number | null;
  icir: number | null;
  count: number;
};

const DECAY_COLUMNS = [
  { key: "horizon" as const, header: "持有期(日)", width: proportional(1) },
  {
    key: "icMean" as const,
    header: "IC 均值",
    width: proportional(1),
    renderCell: (row: DecayRow) => <Text>{formatNum(row.icMean)}</Text>,
  },
  {
    key: "rankIcMean" as const,
    header: "RankIC 均值",
    width: proportional(1),
    renderCell: (row: DecayRow) => <Text>{formatNum(row.rankIcMean)}</Text>,
  },
  {
    key: "icir" as const,
    header: "ICIR",
    width: proportional(1),
    renderCell: (row: DecayRow) => <Text>{formatNum(row.icir)}</Text>,
  },
  { key: "count" as const, header: "样本数", width: proportional(1) },
];

type TurnoverRow = Record<string, unknown> & {
  key: string;
  layer: number;
  turnover: number | null;
};

const TURNOVER_COLUMNS = [
  {
    key: "layer" as const,
    header: "分层",
    width: proportional(1),
    renderCell: (row: TurnoverRow) => <Text>第 {row.layer} 层</Text>,
  },
  {
    key: "turnover" as const,
    header: "换手率",
    width: proportional(1),
    renderCell: (row: TurnoverRow) => <Text>{formatPct(row.turnover, 1)}</Text>,
  },
];

function FactorDetailPage() {
  const { factorName } = useParams({ from: "/home/factors/$factorName" });
  const navigate = useNavigate();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [horizon, setHorizon] = useState(1);
  const [layers, setLayers] = useState(5);
  const [bars, setBars] = useState(500);
  // 样本外占比：默认切出最后 30% 作样本外，用于度量过拟合；0 表示不切分
  const [validRatio, setValidRatio] = useState(0.3);
  // PIT 复权基准日：留空（undefined）用最新复权因子快照；指定日期则只用该日之前的快照，
  // 消除前视偏差。当前库内仅一个快照（2026-10-01），早于该日等价于不复权。
  const [asOf, setAsOf] = useState<ISODateString | undefined>(undefined);

  const { data: factor, isLoading } = useFactorQuery(factorName);
  const updateFactor = useUpdateFactor();
  const deleteFactor = useDeleteFactor();
  const evaluation = useFactorEvaluation(factorName);
  const userId = authClient.useSession().data?.user.id;

  const evaluationResult = evaluation.data;
  const layerRows: LayerRow[] = useMemo(() => {
    if (!evaluationResult) return [];
    const rows: LayerRow[] = evaluationResult.layers.summary.map((item) => ({
      key: `L${item.layer}`,
      name: `第 ${item.layer} 层`,
      cumRet: item.cumRet,
      annRet: item.annRet,
      winRate: item.winRate,
      days: item.days,
    }));
    const longShort = evaluationResult.layers.longShort;
    rows.push({
      key: "longShort",
      name: "多空",
      cumRet: longShort.cumRet,
      annRet: longShort.annRet,
      winRate: longShort.winRate,
      days: evaluationResult.layers.dates.length,
    });
    return rows;
  }, [evaluationResult]);

  const decayRows: DecayRow[] = useMemo(() => {
    if (!evaluationResult) return [];
    return evaluationResult.decay.map((item) => ({
      horizon: item.horizon,
      icMean: item.icMean,
      rankIcMean: item.rankIcMean,
      icir: item.icir,
      count: item.count,
    }));
  }, [evaluationResult]);

  const turnoverRows: TurnoverRow[] = useMemo(() => {
    if (!evaluationResult) return [];
    return evaluationResult.turnover.byLayer.map((item) => ({
      key: `L${item.layer}`,
      layer: item.layer,
      turnover: item.turnover,
    }));
  }, [evaluationResult]);

  const monthlyIcPoints = useMemo(
    () =>
      (evaluationResult?.monthlyIc ?? []).map((item) => ({
        month: item.month,
        ic: item.ic,
        rankIc: item.rankIc,
      })),
    [evaluationResult],
  );

  const decaySummary = useMemo(
    () => summarizeDecay(evaluationResult?.decay ?? []),
    [evaluationResult],
  );

  const decayPoints = useMemo(
    () =>
      (evaluationResult?.decay ?? []).map((item) => ({
        horizon: item.horizon,
        ic: item.icMean,
        rankIc: item.rankIcMean,
      })),
    [evaluationResult],
  );

  if (isLoading) {
    return <Spinner size="sm" label="加载中..." />;
  }

  if (!factor) {
    return <Text type="supporting">因子不存在</Text>;
  }

  // 仅创建者本人可编辑 / 删除 / 修改公开状态
  const canEdit = factor.createdBy === userId;
  const kind = normalizeFactorKind(factor.kind);
  const expression = factor.expression ?? AKQUANT_FACTOR_EXPRESSIONS[factor.name] ?? "";

  let definition: ReactNode;
  if (kind === "python") {
    definition = factor.code ? (
      <PythonCodeEditor value={factor.code} isReadOnly height={360} ariaLabel="Python 代码" />
    ) : (
      <Text type="supporting">—</Text>
    );
  } else if (expression) {
    definition = (
      <ExpressionCodeEditor
        value={expression}
        isReadOnly
        height={360}
        ariaLabel="因子表达式"
      />
    );
  } else {
    definition = <Text type="supporting">—</Text>;
  }

  // 复用编辑草稿结构：切换公开状态时保持其余字段不变
  const buildDraft = (isPublic: boolean): FactorEditDraft => ({
    name: factor.name,
    label: factor.label,
    kind,
    expression: factor.expression ?? "",
    code: factor.code ?? "",
    description: factor.description ?? "",
    isPublic,
  });

  return (
    <VStack gap={4}>
      <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
        <Link to="/home/factors" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
        {canEdit ? (
          <DropdownMenu
            button={{
              label: "操作",
              icon: <Icon icon="moreHorizontal" />,
              variant: "ghost",
              size: "sm",
              isIconOnly: true,
            }}
            hasChevron={false}
            items={[
              {
                label: "编辑",
                icon: Pencil,
                onClick: () =>
                  navigate({ to: "/home/factors/save", search: { name: factor.name } }),
              },
              { label: "删除", icon: Trash2, onClick: () => setIsDeleteOpen(true) },
            ]}
          />
        ) : null}
      </HStack>

      <VStack gap={1}>
        <Heading level={2}>{factor.label}</Heading>
        <Text type="supporting" size="sm">
          {factor.name}
          {factor.description ? ` · ${factor.description}` : ""}
        </Text>
      </VStack>

      <Card padding={5}>
        <VStack gap={4}>
          <Text style={{ fontWeight: 600 }}>因子信息</Text>
          <HStack gap={6} style={{ flexWrap: "wrap" }}>
            <InfoItem label="分类">
              <Badge label={formatFactorCategory(factor.category)} />
            </InfoItem>
            <InfoItem label="方式">
              <Badge label={FACTOR_KIND_LABELS[kind]} />
            </InfoItem>
            <InfoItem label="方向">
              <Text style={{ fontWeight: 600 }}>{factor.direction === 1 ? "正向" : "反向"}</Text>
            </InfoItem>
            <InfoItem label="创建者">
              <Text style={{ fontWeight: 600 }}>{factor.creator}</Text>
            </InfoItem>
          </HStack>
        </VStack>
      </Card>

      <Card padding={5}>
        <VStack gap={3}>
          <Text style={{ fontWeight: 600 }}>定义</Text>
          {definition}
        </VStack>
      </Card>

      <Card padding={5}>
        <VStack gap={4}>
          <HStack
            gap={2}
            align="center"
            style={{ flexWrap: "wrap", justifyContent: "space-between" }}
          >
            <VStack gap={1}>
              <Text style={{ fontWeight: 600 }}>检验</Text>
              <Text type="supporting" size="sm">
                全市场面板上的 IC / RankIC / ICIR、分层回测与因子衰退
              </Text>
            </VStack>
            <Button
              label={evaluationResult ? "重新检验" : "开始检验"}
              variant="primary"
              size="sm"
              isLoading={evaluation.isPending}
              onClick={() => evaluation.mutate({ horizon, layers, bars, validRatio, asOf })}
            />
          </HStack>

          <HStack gap={4} style={{ flexWrap: "wrap" }}>
            <EvalParamControl
              label="持有期"
              value={horizon}
              options={[1, 5, 10, 20]}
              suffix=" 日"
              isDisabled={evaluation.isPending}
              onChange={setHorizon}
            />
            <EvalParamControl
              label="分层数"
              value={layers}
              options={[3, 5, 10]}
              suffix=" 层"
              isDisabled={evaluation.isPending}
              onChange={setLayers}
            />
            <EvalParamControl
              label="回溯交易日"
              value={bars}
              options={[250, 500, 1000]}
              isDisabled={evaluation.isPending}
              onChange={setBars}
            />
            <EvalParamControl
              label="样本外占比"
              value={validRatio}
              options={[0, 0.3, 0.4]}
              formatOption={(v) => (v === 0 ? "不切分" : `${Math.round(v * 100)}%`)}
              isDisabled={evaluation.isPending}
              onChange={setValidRatio}
            />
            <VStack gap={2} style={{ minWidth: 220 }}>
              <DateInput
                label="PIT 复权基准日"
                description="留空用最新快照；指定日期则只用该日之前的复权因子，消除前视偏差"
                value={asOf}
                onChange={setAsOf}
                max={TODAY_ISO}
                hasClear
                placeholder="最新快照"
                isDisabled={evaluation.isPending}
                disabledMessage="检验进行中，暂不可调整"
              />
            </VStack>
          </HStack>

          {evaluation.isError ? (
            <Text type="supporting" size="sm" style={{ color: "var(--color-error)" }}>
              {(evaluation.error as Error)?.message}
            </Text>
          ) : null}

          {evaluationResult ? (
            <VStack gap={4}>
              <Text type="supporting" size="sm">
                样本：{evaluationResult.universe.symbols} 只 × {evaluationResult.universe.bars} 交易日（
                {evaluationResult.universe.startDate} ~ {evaluationResult.universe.endDate}）· 耗时{" "}
                {(evaluationResult.elapsedMs / 1000).toFixed(1)}s
              </Text>

              <HStack gap={6} style={{ flexWrap: "wrap" }}>
                <InfoItem label="IC 均值">
                  <Text style={{ fontWeight: 600 }}>{formatNum(evaluationResult.ic.mean)}</Text>
                </InfoItem>
                <InfoItem label="IC 标准差">
                  <Text style={{ fontWeight: 600 }}>{formatNum(evaluationResult.ic.std)}</Text>
                </InfoItem>
                <InfoItem label="ICIR">
                  <Text style={{ fontWeight: 600 }}>{formatNum(evaluationResult.ic.icir)}</Text>
                </InfoItem>
                <InfoItem label="t 值">
                  <Text style={{ fontWeight: 600 }}>{formatNum(evaluationResult.ic.tStat)}</Text>
                </InfoItem>
                <InfoItem label="IC>0 占比">
                  <Text style={{ fontWeight: 600 }}>
                    {formatPct(evaluationResult.ic.positiveRatio, 1)}
                  </Text>
                </InfoItem>
                <InfoItem label="年化 ICIR">
                  <Text style={{ fontWeight: 600 }}>{formatNum(evaluationResult.ic.icirAnnual)}</Text>
                </InfoItem>
                <InfoItem label="RankIC 均值">
                  <Text style={{ fontWeight: 600 }}>{formatNum(evaluationResult.rankIc.mean)}</Text>
                </InfoItem>
                <InfoItem label="有效天数">
                  <Text style={{ fontWeight: 600 }}>{evaluationResult.ic.count}</Text>
                </InfoItem>
              </HStack>

              <VStack gap={3}>
                <VStack gap={1}>
                  <Text type="label">因子质量诊断</Text>
                  <Text type="supporting" size="sm">
                    换手率越低、秩自相关越高越省调仓成本；多空 Alpha 越显著、IC 越接近正态，预测越可信
                  </Text>
                </VStack>
                <HStack gap={6} style={{ flexWrap: "wrap" }}>
                  <InfoItem label="分位换手率">
                    <Text style={{ fontWeight: 600 }}>
                      {formatPct(evaluationResult.turnover.mean, 1)}
                    </Text>
                  </InfoItem>
                  <InfoItem label="秩自相关">
                    <Text style={{ fontWeight: 600 }}>
                      {formatNum(evaluationResult.rankAutocorr.mean)}
                    </Text>
                  </InfoItem>
                  <InfoItem label="多空 Beta">
                    <Text style={{ fontWeight: 600 }}>
                      {formatNum(evaluationResult.alphaBeta.beta)}
                    </Text>
                  </InfoItem>
                  <InfoItem label="多空年化 Alpha">
                    <Text style={{ fontWeight: 600 }}>
                      {formatPct(evaluationResult.alphaBeta.annualAlpha)}
                    </Text>
                  </InfoItem>
                  <InfoItem label="IC 偏度">
                    <Text style={{ fontWeight: 600 }}>
                      {formatNum(evaluationResult.icNormality.skew)}
                    </Text>
                  </InfoItem>
                  <InfoItem label="IC 峰度">
                    <Text style={{ fontWeight: 600 }}>
                      {formatNum(evaluationResult.icNormality.kurtosis)}
                    </Text>
                  </InfoItem>
                  <InfoItem label="JB p 值">
                    <Text style={{ fontWeight: 600 }}>
                      {formatNum(evaluationResult.icNormality.pValue)}
                    </Text>
                  </InfoItem>
                </HStack>
              </VStack>

              {evaluationResult.split ? (
                <VStack gap={2}>
                  <HStack gap={2} align="center" style={{ flexWrap: "wrap" }}>
                    <Badge label="样本外 (OOS)" variant="warning" />
                    <Text size="sm" type="supporting">
                      样本内为切分日之前，样本外保留最后{" "}
                      {formatPct(evaluationResult.split.validRatio, 0)}（起点{" "}
                      {evaluationResult.split.splitDate}）
                    </Text>
                  </HStack>

                  {evaluationResult.valid ? (
                    <VStack gap={2}>
                      <HStack gap={6} style={{ flexWrap: "wrap" }}>
                        <InfoItem label="样本外 IC 均值">
                          <Text style={{ fontWeight: 600 }}>
                            {formatNum(evaluationResult.valid.ic.mean)}
                          </Text>
                        </InfoItem>
                        <InfoItem label="样本外 RankIC 均值">
                          <Text style={{ fontWeight: 600 }}>
                            {formatNum(evaluationResult.valid.rankIc.mean)}
                          </Text>
                        </InfoItem>
                        <InfoItem label="样本外 ICIR">
                          <Text style={{ fontWeight: 600 }}>
                            {formatNum(evaluationResult.valid.ic.icir)}
                          </Text>
                        </InfoItem>
                        <InfoItem label="样本外多空年化">
                          <Text style={{ fontWeight: 600 }}>
                            {formatPct(evaluationResult.valid.longShort.annRet)}
                          </Text>
                        </InfoItem>
                        <InfoItem label="样本外换手率">
                          <Text style={{ fontWeight: 600 }}>
                            {formatPct(evaluationResult.valid.turnover.mean, 1)}
                          </Text>
                        </InfoItem>
                        <InfoItem label="样本外秩自相关">
                          <Text style={{ fontWeight: 600 }}>
                            {formatNum(evaluationResult.valid.rankAutocorr.mean)}
                          </Text>
                        </InfoItem>
                        <InfoItem label="样本外有效天数">
                          <Text style={{ fontWeight: 600 }}>
                            {evaluationResult.valid.sampleCount}
                          </Text>
                        </InfoItem>
                      </HStack>
                      <Text size="sm" type="supporting">
                        样本外 IC 明显低于样本内通常意味着过拟合；接近甚至更高则更可信。
                      </Text>
                    </VStack>
                  ) : (
                    <Text size="sm" type="supporting">
                      样本外区间交易日不足，无法计算样本外指标。
                    </Text>
                  )}
                </VStack>
              ) : null}

              <VStack gap={2}>
                <Text type="label">IC 时序</Text>
                <FactorIcChart series={evaluationResult.icSeries} />
              </VStack>

              <VStack gap={2}>
                <Text type="label">分层净值（第 1 层因子值最低）</Text>
                <FactorLayerChart
                  dates={evaluationResult.layers.dates}
                  nav={evaluationResult.layers.nav}
                />
              </VStack>

              <VStack gap={2}>
                <Text type="label">分层收益</Text>
                <Table<LayerRow>
                  idKey="key"
                  columns={LAYER_COLUMNS}
                  data={layerRows}
                  density="compact"
                  dividers="rows"
                  hasHover
                />
              </VStack>

              {turnoverRows.length > 0 ? (
                <VStack gap={3}>
                  <VStack gap={1}>
                    <Text type="label">分层换手率（相邻交易日持仓变动）</Text>
                    <Text type="supporting" size="sm">
                      换手率越高，调仓越频繁、交易成本越高；极端分层通常换手更高
                    </Text>
                  </VStack>
                  <Table<TurnoverRow>
                    idKey="key"
                    columns={TURNOVER_COLUMNS}
                    data={turnoverRows}
                    density="compact"
                    dividers="rows"
                    hasHover
                  />
                </VStack>
              ) : null}

              <VStack gap={3}>
                <VStack gap={1}>
                  <Text type="label">因子衰退（不同持有期的预测能力）</Text>
                  <Text type="supporting" size="sm">
                    |IC| 随持有期下滑越快，说明信号越短命；半衰期越长、保留率越高越耐用
                  </Text>
                </VStack>

                <HStack gap={6} style={{ flexWrap: "wrap" }}>
                  <InfoItem label="半衰期">
                    <Text style={{ fontWeight: 600 }}>{formatHalfLife(decaySummary)}</Text>
                  </InfoItem>
                  <InfoItem label={`IC 保留率（${decaySummary.maxHorizon ?? "—"} 日）`}>
                    <Text style={{ fontWeight: 600 }}>
                      {formatPct(decaySummary.retention, 1)}
                    </Text>
                  </InfoItem>
                </HStack>

                <FactorDecayChart points={decayPoints} />

                <Table<DecayRow>
                  idKey="horizon"
                  columns={DECAY_COLUMNS}
                  data={decayRows}
                  density="compact"
                  dividers="rows"
                  hasHover
                />
              </VStack>

              {monthlyIcPoints.length > 0 ? (
                <VStack gap={2}>
                  <Text type="label">月度 IC（按自然月聚合）</Text>
                  <FactorMonthlyIcChart points={monthlyIcPoints} />
                </VStack>
              ) : null}
            </VStack>
          ) : (
            !evaluation.isPending && (
              <Text type="supporting" size="sm">
                点击「开始检验」计算该因子在最近一段行情中的预测能力与分层区分度。
              </Text>
            )
          )}
        </VStack>
      </Card>

      <Card padding={5}>
        <Switch
          label="公开"
          description={canEdit ? "开启后其他用户也能看到该因子" : "仅创建者可修改公开状态"}
          value={factor.isPublic}
          isDisabled={!canEdit}
          isLoading={updateFactor.isPending}
          onChange={(checked) => updateFactor.mutate(buildDraft(checked))}
        />
      </Card>

      <ConfirmDeleteDialog
        isOpen={isDeleteOpen}
        title="删除因子"
        message={`确认删除因子「${factor.label}」？`}
        isLoading={deleteFactor.isPending}
        onOpenChange={(open) => !open && setIsDeleteOpen(false)}
        onConfirm={() => {
          deleteFactor.mutate(factor.name, {
            onSuccess: () => navigate({ to: "/home/factors" }),
          });
        }}
      />
    </VStack>
  );
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <VStack gap={1}>
      <Text type="supporting" size="sm">
        {label}
      </Text>
      {children}
    </VStack>
  );
}

function EvalParamControl({
  label,
  value,
  options,
  suffix,
  formatOption,
  isDisabled,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  suffix?: string;
  formatOption?: (value: number) => string;
  isDisabled?: boolean;
  onChange: (value: number) => void;
}) {
  const renderOptionLabel = (option: number) =>
    formatOption ? formatOption(option) : `${option}${suffix ?? ""}`;
  return (
    <VStack gap={2} style={{ minWidth: 200 }}>
      <Text type="label">{label}</Text>
      <SegmentedControl
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
        label={label}
        layout="fill"
        isDisabled={isDisabled}
        disabledMessage="检验进行中，暂不可调整"
      >
        {options.map((option) => (
          <SegmentedControlItem
            key={option}
            value={String(option)}
            label={renderOptionLabel(option)}
          />
        ))}
      </SegmentedControl>
    </VStack>
  );
}
