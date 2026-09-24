import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { FactorForm } from "../../../components/FactorForm";
import { authClient } from "../../../lib/auth-client";
import { useFactorQuery, useUpdateFactor, normalizeFactorKind } from "../../../hooks/useFactors";

/**
 * 因子编辑页。
 * 通过 name 查询参数定位因子（name 为唯一标识），加载并预填表单。
 */
export const Route = createFileRoute("/home/factors/save")({
  validateSearch: (search: Record<string, unknown>): { name?: string } => {
    const raw = search.name;
    return typeof raw === "string" && raw ? { name: raw } : {};
  },
  component: FactorSavePage,
});

function FactorSavePage() {
  const navigate = useNavigate();
  const { name } = Route.useSearch();
  const { data: factor, isLoading } = useFactorQuery(name ?? "");
  const updateFactor = useUpdateFactor();
  const userId = authClient.useSession().data?.user.id;

  if (!name) {
    return <Text type="supporting">缺少因子标识</Text>;
  }

  if (isLoading) {
    return <Spinner size="sm" label="加载中..." />;
  }

  if (!factor) {
    return <Text type="supporting">因子不存在</Text>;
  }

  const canEdit = factor.createdBy === userId;
  const detailLink = {
    to: "/home/factors/$factorName" as const,
    params: { factorName: factor.name },
  };

  return (
    <VStack gap={4}>
      <Link {...detailLink} style={{ textDecoration: "none" }}>
        <Button label="← 返回" variant="ghost" size="sm" />
      </Link>

      <FactorForm
        key={factor.name}
        title="编辑因子"
        subtitle="修改显示名称、描述、定义方式与公开状态"
        submitLabel="保存"
        initialValues={{
          name: factor.name,
          label: factor.label,
          description: factor.description ?? "",
          kind: normalizeFactorKind(factor.kind),
          expression: factor.expression ?? "",
          code: factor.code ?? "",
          isPublic: factor.isPublic,
        }}
        canEdit={canEdit}
        isSubmitting={updateFactor.isPending}
        onCancel={() => navigate(detailLink)}
        onSubmit={(input) =>
          updateFactor.mutate(input, {
            onSuccess: () => navigate(detailLink),
          })
        }
      />
    </VStack>
  );
}
