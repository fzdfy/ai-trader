import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Table, proportional } from "@astryxdesign/core/Table";
import { SectorFundFlowChart } from "../../components/charts/SectorFundFlowChart";
import { MainlineCards } from "../../components/charts/MainlineCards";
import {
  useReviewSkillQuery,
  useUpdateReviewSkill,
  useGenerateReview,
  useReviewListQuery,
  useReviewQuery,
  type Review,
  type ReviewSkill,
  type ReviewSection,
  type ReviewSectionType,
  type ReviewStockPoolItem,
} from "../../hooks/useReviews";

// ---------- 常量 ----------

const SECTION_TYPE_LABELS: Record<ReviewSectionType, string> = {
  fundflow: "行业资金流向",
  mainline: "主线",
  stockpool: "选股池",
  summary: "总结",
};

const SECTION_TYPE_OPTIONS = (
  Object.entries(SECTION_TYPE_LABELS) as [ReviewSectionType, string][]
).map(([value, label]) => ({ value, label }));

/** 各模块默认图表类型（用于新增/切换模块时兜底） */
function defaultChartFor(type: ReviewSectionType): ReviewSection["chart"] {
  switch (type) {
    case "fundflow":
      return "bar";
    case "mainline":
      return "bar";
    case "stockpool":
      return "table";
    case "summary":
      return "text";
  }
}

/** 今日日期 YYYY-MM-DD */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- 模块渲染 ----------

/** 选股池表格行（Table 泛型要求 Record<string, unknown>） */
type StockPoolRow = Record<string, unknown> & ReviewStockPoolItem;

const stockPoolColumns = [
  {
    key: "name" as const,
    header: "股票",
    width: proportional(2),
    renderCell: (row: StockPoolRow) => (
      <VStack gap={0}>
        <Text style={{ fontWeight: 600 }}>{row.name}</Text>
        <Text type="supporting" size="sm">
          {row.symbol}
        </Text>
      </VStack>
    ),
  },
  {
    key: "source" as const,
    header: "来源",
    width: proportional(1.5),
    renderCell: (row: StockPoolRow) => <Text>{row.source ?? "-"}</Text>,
  },
  {
    key: "score" as const,
    header: "得分",
    width: proportional(0.8),
    renderCell: (row: StockPoolRow) => <Text>{row.score ?? "-"}</Text>,
  },
];

function StockPoolTable({ data }: { data: ReviewStockPoolItem[] }) {
  if (data.length === 0) return <Text type="supporting">当日选股池为空</Text>;
  return (
    <Table<StockPoolRow>
      idKey="symbol"
      columns={stockPoolColumns}
      data={data as StockPoolRow[]}
      density="compact"
      dividers="rows"
      hasHover
    />
  );
}

function SummaryBlock({ text }: { text: string }) {
  if (!text) return <Text type="supporting">暂无总结</Text>;
  return (
    <div
      style={{
        background: "var(--color-background-card)",
        border: "1px solid var(--color-border)",
        borderLeft: "4px solid var(--color-accent)",
        borderRadius: "var(--radius-md, 8px)",
        padding: "var(--spacing-4)",
      }}
    >
      <Text style={{ lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{text}</Text>
    </div>
  );
}

/** 根据 skill 的 section.type 动态选择渲染组件（UI 由 skill 配置动态生成） */
function renderSectionBody(section: ReviewSection, review: Review): ReactNode {
  switch (section.type) {
    case "fundflow":
      return <SectorFundFlowChart data={review.fundflow} />;
    case "mainline":
      return <MainlineCards data={review.mainline} />;
    case "stockpool":
      return <StockPoolTable data={review.stockPool} />;
    case "summary":
      return <SummaryBlock text={review.summary} />;
    default:
      return null;
  }
}

function ReviewSectionBlock({ section, review }: { section: ReviewSection; review: Review }) {
  const title = section.title || SECTION_TYPE_LABELS[section.type];
  return (
    <VStack gap={3}>
      <Text style={{ fontWeight: 700, fontSize: 16 }}>{title}</Text>
      {renderSectionBody(section, review)}
    </VStack>
  );
}

// ---------- 页面 ----------

export const Route = createFileRoute("/home/reviews")({
  component: ReviewsPage,
});

function ReviewsPage() {
  const [date, setDate] = useState<string>(today());

  const { data: skill } = useReviewSkillQuery();
  const { data: reviewList = [] } = useReviewListQuery();
  const reviewQuery = useReviewQuery(date);
  const review = reviewQuery.data ?? null;

  const generate = useGenerateReview();
  const saveSkill = useUpdateReviewSkill();

  // skill 编辑草稿（首次加载时同步一次，避免窗口聚焦重取覆盖未保存编辑）
  const [draft, setDraft] = useState<ReviewSkill | null>(null);
  const skillLoadedRef = useRef(false);
  useEffect(() => {
    if (skill && !skillLoadedRef.current) {
      setDraft(skill);
      skillLoadedRef.current = true;
    }
  }, [skill]);

  // 回放日期选择：历史复盘日期 ∪ 当前日期（保证 value 始终是合法选项）
  const dateOptions = useMemo(() => {
    const set = new Set(reviewList.map((r) => r.date));
    if (date) set.add(date);
    return [...set]
      .sort()
      .reverse()
      .map((d) => ({ value: d, label: d }));
  }, [reviewList, date]);

  // 渲染模块：优先当前 skill（编辑后立即生效），否则退回复盘快照中的 skill
  const sections: ReviewSection[] = skill?.sections ?? review?.skill?.sections ?? [];

  const updateSection = (index: number, patch: Partial<ReviewSection>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      };
    });
  };

  const removeSection = (index: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, sections: prev.sections.filter((_, i) => i !== index) };
    });
  };

  const addSection = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      const type: ReviewSectionType = "fundflow";
      return {
        ...prev,
        sections: [
          ...prev.sections,
          { type, title: SECTION_TYPE_LABELS[type], chart: defaultChartFor(type) },
        ],
      };
    });
  };

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={2}>复盘</Heading>
        <Text type="supporting">
          每日复盘：行业资金流向、主线、选股池与总结。复盘方法（Skill）可编辑，Agent
          动态读取；页面模块由 Skill 配置动态生成。
        </Text>
      </VStack>

      {/* 操作栏：回放 / 重新生成 */}
      <Section>
        <HStack gap={3} align="end" style={{ flexWrap: "wrap" }}>
          <TextInput
            label="复盘日期"
            value={date}
            onChange={(v) => setDate(v.trim())}
            placeholder="YYYY-MM-DD"
            width={160}
          />
          <Selector
            label="历史复盘"
            options={dateOptions}
            value={date}
            onChange={setDate}
            placeholder="选择日期回放"
            isDisabled={dateOptions.length === 0}
            width={180}
          />
          <Button
            label={generate.isPending ? "生成中..." : "生成 / 重新生成"}
            variant="primary"
            isDisabled={!date || generate.isPending}
            onClick={() => generate.mutate(date)}
          />
        </HStack>
        {generate.isError && (
          <Text style={{ color: "var(--color-text-negative)" }}>
            {(generate.error as Error)?.message ?? "复盘生成失败，请稍后重试"}
          </Text>
        )}
      </Section>

      {/* 复盘内容 */}
      {reviewQuery.isLoading && <Spinner size="sm" label="正在加载复盘..." />}

      {!reviewQuery.isLoading && review && (
        <VStack gap={4}>
          <Text type="supporting">
            复盘日期 {review.date} · 更新于 {formatDateTime(review.updatedAt)}
          </Text>
          {sections.length === 0 ? (
            <Text type="supporting">暂无可用模块，请检查 Skill 配置。</Text>
          ) : (
            sections.map((section, i) => (
              <ReviewSectionBlock key={`${section.type}-${i}`} section={section} review={review} />
            ))
          )}
        </VStack>
      )}

      {!reviewQuery.isLoading && !review && (
        <Text type="supporting">该日期暂无复盘，点击「生成 / 重新生成」创建。</Text>
      )}

      {/* Skill 编辑面板 */}
      <Section>
        <VStack gap={3}>
          <Text style={{ fontWeight: 700, fontSize: 16 }}>复盘 Skill</Text>
          <Text type="supporting" size="sm">
            Agent 生成复盘时会动态读取此 Skill；下方模块列表决定复盘页的动态渲染内容与顺序。
          </Text>
          {draft ? (
            <>
              <TextArea
                label="复盘方法论（instructions）"
                value={draft.instructions}
                onChange={(v) => setDraft({ ...draft, instructions: v })}
                rows={8}
                placeholder="描述复盘应遵循的方法论与关注要点..."
              />
              <Text style={{ fontWeight: 600 }}>UI 模块</Text>
              {draft.sections.map((s, i) => (
                <HStack key={`${s.type}-${i}`} gap={2} align="center">
                  <Selector
                    label="模块"
                    options={SECTION_TYPE_OPTIONS}
                    value={s.type}
                    onChange={(v) =>
                      updateSection(i, {
                        type: v as ReviewSectionType,
                        chart: defaultChartFor(v as ReviewSectionType),
                      })
                    }
                    width={160}
                  />
                  <TextInput
                    label="标题"
                    value={s.title}
                    onChange={(v) => updateSection(i, { title: v })}
                    width={200}
                  />
                  <Button label="删除" variant="ghost" onClick={() => removeSection(i)} />
                </HStack>
              ))}
              <HStack gap={3}>
                <Button label="添加模块" variant="secondary" onClick={addSection} />
                <Button
                  label={saveSkill.isPending ? "保存中..." : "保存 Skill"}
                  variant="primary"
                  isDisabled={saveSkill.isPending}
                  onClick={() => saveSkill.mutate(draft)}
                />
              </HStack>
              {saveSkill.isSuccess && (
                <Text size="sm" style={{ color: "var(--color-text-positive)" }}>
                  已保存，下次生成复盘时将生效
                </Text>
              )}
              {saveSkill.isError && (
                <Text size="sm" style={{ color: "var(--color-text-negative)" }}>
                  {(saveSkill.error as Error)?.message ?? "保存失败"}
                </Text>
              )}
            </>
          ) : (
            <Spinner size="sm" label="正在加载 Skill..." />
          )}
        </VStack>
      </Section>
    </VStack>
  );
}
