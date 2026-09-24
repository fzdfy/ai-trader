import { useState, type ReactNode } from "react";
import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Card } from "@astryxdesign/core/Card";
import { Switch } from "@astryxdesign/core/Switch";
import { Code } from "@astryxdesign/core/Code";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog";
import { authClient } from "../../../lib/auth-client";
import { AKQUANT_FACTOR_EXPRESSIONS } from "../../../lib/akquantFactors";
import {
  useFactorQuery,
  useUpdateFactor,
  useDeleteFactor,
  normalizeFactorKind,
  FACTOR_CATEGORY_LABELS,
  FACTOR_KIND_LABELS,
  type FactorEditDraft,
} from "../../../hooks/useFactors";

export const Route = createFileRoute("/home/factors/$factorName")({
  component: FactorDetailPage,
});

function FactorDetailPage() {
  const { factorName } = useParams({ from: "/home/factors/$factorName" });
  const navigate = useNavigate();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { data: factor, isLoading } = useFactorQuery(factorName);
  const updateFactor = useUpdateFactor();
  const deleteFactor = useDeleteFactor();
  const userId = authClient.useSession().data?.user.id;

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
      <CodeBlock code={factor.code} language="python" hasLineNumbers width="100%" maxHeight={360} />
    ) : (
      <Text type="supporting">—</Text>
    );
  } else if (expression) {
    definition = <Code>{expression}</Code>;
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
              <Badge label={FACTOR_CATEGORY_LABELS[factor.category] ?? factor.category} />
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
