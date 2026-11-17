import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { VStack, HStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { TextArea } from "@preline-ui/TextArea";
import { Button } from "@preline-ui/Button";
import { Badge } from "@preline-ui/Badge";
import { Card } from "@preline-ui/Card";
import { Code } from "@preline-ui/Code";
import { ProgressBar } from "@preline-ui/ProgressBar";
import { SegmentedControl, SegmentedControlItem } from "@preline-ui/SegmentedControl";
import { Sparkles } from "lucide-react";
import {
  useFactorIterate,
  useFactorIterateStatus,
  useFactorIterateRuns,
  useFactorIterateRun,
  type FactorIterateRound,
} from "../../../hooks/useFactors";

/**
 * AI 因子迭代页（路线 B 闭环：生成 → 评价 → 反馈 → 迭代）。
 * 输入自然语言描述 → 后台多轮迭代 → 轮询进度 → 展示逐轮轨迹（含各轮指标与最佳轮）→ 一键采纳为因子。
 * 采纳跳转创建页并预填表达式，沿用创建页「测试通过」门禁后落库。
 */
export const Route = createFileRoute("/home/factors/iterate")({
  component: FactorIteratePage,
});

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "error";

/** 单轮状态 → 徽标（evaluated=评价成功 | invalid=校验未通过 | failed=生成/评价异常 | stopped=主动终止） */
const ROUND_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  evaluated: { label: "已评价", variant: "success" },
  stopped: { label: "已终止", variant: "warning" },
  invalid: { label: "无效", variant: "neutral" },
  failed: { label: "失败", variant: "error" },
};

/** 任务状态 → 徽标 */
const RUN_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  running: { label: "进行中", variant: "info" },
  pending: { label: "等待中", variant: "neutral" },
  success: { label: "已完成", variant: "success" },
  failed: { label: "失败", variant: "error" },
};

/** 数值格式化（缺值显示占位符） */
function fmt(value: number | null, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

/** 比率格式化（0~1 → 百分比） */
function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/** 两位数左补零 */
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** ISO 时间 → 「MM-DD HH:mm」 */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <HStack gap={1} align="center">
      <Text size="sm" type="supporting">
        {label}
      </Text>
      <Text size="sm" style={{ fontWeight: 600 }}>
        {value}
      </Text>
    </HStack>
  );
}

/** 单轮轨迹卡片：轮次 + 状态 + 表达式 + 指标 + 采纳入口 */
function RoundCard({
  round,
  onAdopt,
}: {
  round: FactorIterateRound;
  onAdopt: (round: FactorIterateRound) => void;
}) {
  const meta = ROUND_STATUS[round.status] ?? { label: round.status, variant: "neutral" as const };
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
          <HStack gap={2} align="center">
            <Text type="label">第 {round.round} 轮</Text>
            <Badge label={meta.label} variant={meta.variant} />
            {round.isBest ? <Badge label="最佳" variant="info" /> : null}
          </HStack>
          {round.status === "evaluated" && round.expression ? (
            <Button
              label="采纳为因子"
              size="sm"
              variant="secondary"
              onClick={() => onAdopt(round)}
            />
          ) : null}
        </HStack>

        {round.expression ? (
          <Code>{round.expression}</Code>
        ) : (
          <Text size="sm" type="supporting">
            未生成表达式
          </Text>
        )}

        {round.status === "evaluated" ? (
          <HStack gap={3} align="center" style={{ flexWrap: "wrap" }}>
            <MetricItem label="IC" value={fmt(round.icMean)} />
            <MetricItem label="RankIC" value={fmt(round.rankIcMean)} />
            <MetricItem label="ICIR" value={fmt(round.icir)} />
            <MetricItem label="t值" value={fmt(round.tStat, 2)} />
            <MetricItem label="IC>0占比" value={fmtPct(round.positiveRatio)} />
            <MetricItem label="多空年化" value={fmtPct(round.longShortAnnRet)} />
            <MetricItem label="单调性" value={fmt(round.monotonicity, 2)} />
            <MetricItem label="保留率" value={fmt(round.retention, 2)} />
            <MetricItem label="评分" value={fmt(round.score)} />
          </HStack>
        ) : null}

        {round.status === "evaluated" && round.validRatio ? (
          <HStack gap={3} align="center" style={{ flexWrap: "wrap" }}>
            <Badge label="样本外" variant="warning" />
            <MetricItem label="OOS IC" value={fmt(round.validIcMean)} />
            <MetricItem label="OOS RankIC" value={fmt(round.validRankIcMean)} />
            <MetricItem label="OOS ICIR" value={fmt(round.validIcir)} />
            <MetricItem label="OOS 多空年化" value={fmtPct(round.validLongShortAnnRet)} />
            <MetricItem
              label="样本外天数"
              value={round.validSampleCount == null ? "—" : String(round.validSampleCount)}
            />
            {round.splitDate ? <MetricItem label="起点" value={round.splitDate} /> : null}
          </HStack>
        ) : null}

        {round.message ? (
          <Text size="sm" type="supporting">
            说明：{round.message}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}

function FactorIteratePage() {
  const navigate = useNavigate();
  const iterate = useFactorIterate();
  const statusQuery = useFactorIterateStatus();
  const runsQuery = useFactorIterateRuns(10);

  const [description, setDescription] = useState("");
  const [rounds, setRounds] = useState("3");
  // 选中的历史任务；为 null 时跟随「最新一次」
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const runs = runsQuery.data ?? [];
  const effectiveRunId = selectedRunId ?? runs[0]?.id ?? null;
  const runQuery = useFactorIterateRun(effectiveRunId);
  const activeRun = runQuery.data?.run ?? null;
  const roundsData = runQuery.data?.rounds ?? [];

  const status = statusQuery.data;
  const isRunning = status?.status === "running";

  const handleStart = () => {
    const desc = description.trim();
    if (!desc) return;
    setSelectedRunId(null);
    iterate.mutate({ description: desc, rounds: Number(rounds) });
  };

  // 采纳：跳转创建页并预填表达式与描述，交由创建页做测试门禁后落库
  const handleAdopt = (round: FactorIterateRound) => {
    if (!round.expression) return;
    navigate({
      to: "/home/factors/create",
      search: { expression: round.expression, description: description.trim() },
    });
  };

  return (
    <VStack gap={4}>
      <Link to="/home/factors" style={{ textDecoration: "none" }}>
        <Button label="← 返回" variant="ghost" size="sm" />
      </Link>

      <VStack gap={1}>
        <Heading level={2}>AI 因子迭代</Heading>
        <Text type="supporting">
          用自然语言描述想要的因子，AI 将多轮「生成 → 评价 → 依据指标反馈改写」，并保留每一轮的轨迹与指标；对满意的轮次可一键采纳为因子
        </Text>
      </VStack>

      <VStack gap={3}>
        <TextArea
          label="因子描述"
          value={description}
          onChange={setDescription}
          placeholder="如：捕捉放量突破后的短期动量，要求对近 20 日成交额敏感"
          isDisabled={isRunning}
        />
        <HStack gap={3} align="center" style={{ flexWrap: "wrap" }}>
          <HStack gap={2} align="center">
            <Text size="sm" type="supporting">
              迭代轮次
            </Text>
            <SegmentedControl
              value={rounds}
              onChange={setRounds}
              label="迭代轮次"
              layout="hug"
              size="sm"
              isDisabled={isRunning}
            >
              <SegmentedControlItem value="2" label="2 轮" />
              <SegmentedControlItem value="3" label="3 轮" />
              <SegmentedControlItem value="5" label="5 轮" />
            </SegmentedControl>
          </HStack>
          <Button
            label="开始迭代"
            variant="primary"
            icon={<Sparkles size={14} />}
            isLoading={iterate.isPending}
            isDisabled={isRunning || !description.trim()}
            tooltip={description.trim() ? "提交并后台多轮迭代" : "请先填写因子描述"}
            onClick={handleStart}
          />
          {isRunning ? (
            <Text size="sm" type="supporting">
              已有迭代任务进行中，完成后可再次发起
            </Text>
          ) : null}
        </HStack>

        {iterate.isError ? (
          <Text size="sm" style={{ color: "var(--color-text-negative)" }}>
            {(iterate.error as Error).message}
          </Text>
        ) : null}

        {isRunning ? (
          <VStack gap={2}>
            <ProgressBar
              label="AI 迭代进度"
              value={status?.processed ?? 0}
              max={status?.total ?? 1}
              hasValueLabel
              formatValueLabel={(value, max) => `${value}/${max} 轮`}
            />
            {status?.message ? (
              <Text size="sm" type="supporting">
                {status.message}
              </Text>
            ) : null}
          </VStack>
        ) : null}

        {status?.status === "failed" ? (
          <Text size="sm" style={{ color: "var(--color-text-negative)" }}>
            迭代失败：{status.error ?? "未知原因"}
          </Text>
        ) : null}

        {status?.status === "success" && status.message ? (
          <Text size="sm" type="supporting">
            {status.message}
          </Text>
        ) : null}
      </VStack>

      <VStack gap={3}>
        <Text type="label">迭代轨迹</Text>

        {activeRun ? (
          <VStack gap={3}>
            <HStack gap={2} align="center" style={{ flexWrap: "wrap" }}>
              <Text type="label">任务 #{activeRun.id}</Text>
              <Badge
                label={RUN_STATUS[activeRun.status]?.label ?? activeRun.status}
                variant={RUN_STATUS[activeRun.status]?.variant ?? "neutral"}
              />
              {activeRun.startedAt ? (
                <Text size="sm" type="supporting">
                  {formatTime(activeRun.startedAt)}
                </Text>
              ) : null}
              {activeRun.processed != null && activeRun.total != null ? (
                <Text size="sm" type="supporting">
                  {activeRun.processed}/{activeRun.total} 轮
                </Text>
              ) : null}
            </HStack>

            {activeRun.error ? (
              <Text size="sm" style={{ color: "var(--color-text-negative)" }}>
                {activeRun.error}
              </Text>
            ) : null}

            {roundsData.length > 0 ? (
              <VStack gap={2}>
                {roundsData.map((round) => (
                  <RoundCard key={round.id} round={round} onAdopt={handleAdopt} />
                ))}
              </VStack>
            ) : (
              <Text type="supporting">
                {runQuery.isLoading ? "加载中..." : "该任务暂无逐轮记录"}
              </Text>
            )}
          </VStack>
        ) : (
          <Text type="supporting">暂无迭代记录，填写描述后开始第一次迭代</Text>
        )}
      </VStack>

      {runs.length > 0 ? (
        <VStack gap={2}>
          <Text type="label">历史任务</Text>
          <VStack gap={1}>
            {runs.map((run) => {
              const isActive = run.id === effectiveRunId;
              return (
                <HStack key={run.id} gap={2} align="center">
                  <Badge label={`#${run.id}`} />
                  <Badge
                    label={RUN_STATUS[run.status]?.label ?? run.status}
                    variant={RUN_STATUS[run.status]?.variant ?? "neutral"}
                  />
                  <Text size="sm" type="supporting">
                    {formatTime(run.startedAt)}
                  </Text>
                  <Text size="sm" type="supporting" style={{ flex: 1, minWidth: 0 }}>
                    {run.message ?? ""}
                  </Text>
                  <Button
                    label={isActive ? "查看中" : "查看"}
                    size="sm"
                    variant={isActive ? "primary" : "ghost"}
                    onClick={() => setSelectedRunId(run.id)}
                  />
                </HStack>
              );
            })}
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  );
}
