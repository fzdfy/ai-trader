import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { VStack, HStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { TextInput } from "@preline-ui/TextInput";
import { TextArea } from "@preline-ui/TextArea";
import { Button } from "@preline-ui/Button";
import { IconButton } from "@preline-ui/IconButton";
import { Switch } from "@preline-ui/Switch";
import { HoverCard } from "@preline-ui/HoverCard";
import { SegmentedControl, SegmentedControlItem } from "@preline-ui/SegmentedControl";
import { BookOpenText, Sparkles } from "lucide-react";
import { FactorCodeReference } from "../../../components/FactorCodeReference";
import { FactorExpressionReference } from "../../../components/FactorExpressionReference";
import { PythonCodeEditor } from "../../../components/PythonCodeEditor";
import { ExpressionCodeEditor } from "../../../components/ExpressionCodeEditor";
import { DefinitionTestBar } from "../../../components/DefinitionTestBar";
import { resolveCodeEditorStatus } from "../../../components/CodeEditorFrame";
import {
  useCreateFactor,
  useGenerateFactorCode,
  useGenerateFactorExpression,
  useFactorDefinitionTesting,
  type FactorKind,
} from "../../../hooks/useFactors";

/**
 * 创建因子页（原弹框改为独立页面）。
 * 名称 + 描述 + 定义方式（因子表达式 / Python 代码）+ 是否公开；两种定义方式都支持「AI 生成」；
 * 定义必须测试通过才能创建。
 */
export const Route = createFileRoute("/home/factors/create")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { expression?: string; description?: string } => {
    const out: { expression?: string; description?: string } = {};
    if (typeof search.expression === "string" && search.expression) {
      out.expression = search.expression;
    }
    if (typeof search.description === "string" && search.description) {
      out.description = search.description;
    }
    return out;
  },
  component: FactorCreatePage,
});

function FactorCreatePage() {
  const navigate = useNavigate();
  const createFactor = useCreateFactor();
  // AI 迭代「采纳」时通过查询参数预填表达式与描述
  const { expression: presetExpression, description: presetDescription } = Route.useSearch();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<FactorKind>("expression");
  const [expression, setExpression] = useState(presetExpression ?? "");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState(presetDescription ?? "");
  const [isPublic, setIsPublic] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [codeGenerateError, setCodeGenerateError] = useState("");

  const generateMutation = useGenerateFactorExpression();
  const generateCodeMutation = useGenerateFactorCode();

  // 新建因子没有已保存基线，必须测试通过才能创建
  const { expression: expressionTest, code: codeTest } = useFactorDefinitionTesting("", "");

  // 手动修改表达式时，清空 AI 生成错误提示与旧的测试结果
  const handleExpressionChange = (value: string) => {
    setExpression(value);
    expressionTest.clear();
    if (generateError) setGenerateError("");
  };

  // 手动修改代码时，清空 AI 生成错误提示与旧的测试结果
  const handleCodeChange = (value: string) => {
    setCode(value);
    codeTest.clear();
    if (codeGenerateError) setCodeGenerateError("");
  };

  const handleGenerate = async () => {
    const desc = description.trim();
    if (!desc) return;
    try {
      const expr = await generateMutation.mutateAsync(desc);
      if (expr.includes("无法生成")) {
        setGenerateError("现有因子算子无法表达该描述，请调整描述或手动填写表达式");
      } else {
        setExpression(expr);
        expressionTest.clear();
        setGenerateError("");
      }
    } catch {
      setGenerateError("AI 生成失败，请稍后重试");
    }
  };

  // Python 代码生成：服务端生成后会做静态校验 + 真实库小样本运行校验，失败返回哨兵与原因
  const handleGenerateCode = async () => {
    const desc = description.trim();
    if (!desc) return;
    try {
      const result = await generateCodeMutation.mutateAsync(desc);
      if (result.code.includes("无法生成")) {
        setCodeGenerateError(
          result.reason ?? "现有数据列与受限运行环境无法表达该描述，请调整描述或手动编写代码",
        );
      } else {
        setCode(result.code);
        codeTest.clear();
        setCodeGenerateError("");
      }
    } catch {
      setCodeGenerateError("AI 生成失败，请稍后重试");
    }
  };

  const isDefinitionEmpty = kind === "python" ? !code.trim() : false;
  // 创建门禁：定义必须测试通过
  const isDefinitionVerified =
    kind === "expression" ? expressionTest.isVerified(expression) : codeTest.isVerified(code);
  const isSubmitDisabled =
    !name.trim() || isDefinitionEmpty || !isDefinitionVerified || createFactor.isPending;

  let submitDisabledReason: string | undefined;
  if (!name.trim()) {
    submitDisabledReason = "请填写名称";
  } else if (isDefinitionEmpty) {
    submitDisabledReason = "请填写因子定义";
  } else if (!isDefinitionVerified) {
    submitDisabledReason = "请先测试通过因子定义";
  }

  const handleSubmit = () => {
    if (isSubmitDisabled) return;
    createFactor.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        kind,
        expression: kind === "expression" ? expression.trim() : "",
        code: kind === "python" ? code.trim() : "",
        isPublic,
      },
      { onSuccess: () => navigate({ to: "/home/factors" }) },
    );
  };

  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2}>创建因子</Heading>
        <Text type="supporting">
          填写名称与描述，选择定义方式（因子表达式或 Python 代码）；定义需先测试通过再创建
        </Text>
      </VStack>

      <TextInput
        label="名称"
        value={name}
        onChange={setName}
        isRequired
        placeholder="如：乖离率"
        hasAutoFocus
      />
      <TextArea
        label="描述"
        value={description}
        onChange={setDescription}
        placeholder="简要说明该因子的含义与用途，AI 将据此生成表达式或代码"
      />

      <VStack gap={2}>
        <Text type="label">定义方式</Text>
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as FactorKind)}
          label="因子定义方式"
          layout="hug"
        >
          <SegmentedControlItem value="expression" label="因子表达式" />
          <SegmentedControlItem value="python" label="Python 代码" />
        </SegmentedControl>
      </VStack>

      {kind === "expression" ? (
        <VStack gap={1}>
          <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
            <HStack gap={1} align="center">
              <Text type="label">因子表达式</Text>
              <HoverCard content={<FactorExpressionReference />} placement="below" alignment="start">
                <IconButton
                  label="因子表达式说明"
                  icon={<BookOpenText size={14} />}
                  variant="ghost"
                  size="sm"
                />
              </HoverCard>
            </HStack>
            <HStack gap={2} align="center">
              <Button
                label="AI 生成"
                size="sm"
                variant="secondary"
                icon={<Sparkles size={14} />}
                isLoading={generateMutation.isPending}
                isDisabled={!description.trim()}
                tooltip={description.trim() ? "根据描述生成表达式" : "请先填写描述"}
                onClick={() => void handleGenerate()}
              />
              <DefinitionTestBar
                isPending={expressionTest.isPending}
                isDisabled={!expression.trim()}
                onTest={() => void expressionTest.test(expression)}
              />
            </HStack>
          </HStack>
          <ExpressionCodeEditor
            value={expression}
            onChange={handleExpressionChange}
            ariaLabel="因子表达式"
            status={resolveCodeEditorStatus({
              generateError,
              testError: expressionTest.error,
              testSuccess: expressionTest.success,
            })}
          />
        </VStack>
      ) : (
        <VStack gap={1}>
          <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
            <HStack gap={1} align="center">
              <Text type="label">Python 代码</Text>
              <HoverCard content={<FactorCodeReference />} placement="below" alignment="start">
                <IconButton
                  label="Python 因子说明"
                  icon={<BookOpenText size={14} />}
                  variant="ghost"
                  size="sm"
                />
              </HoverCard>
            </HStack>
            <HStack gap={2} align="center">
              <Button
                label="AI 生成"
                size="sm"
                variant="secondary"
                icon={<Sparkles size={14} />}
                isLoading={generateCodeMutation.isPending}
                isDisabled={!description.trim()}
                tooltip={description.trim() ? "根据描述生成代码并校验能否运行" : "请先填写描述"}
                onClick={() => void handleGenerateCode()}
              />
              <DefinitionTestBar
                isPending={codeTest.isPending}
                isDisabled={!code.trim()}
                onTest={() => void codeTest.test(code)}
              />
            </HStack>
          </HStack>
          <PythonCodeEditor
            value={code}
            onChange={handleCodeChange}
            ariaLabel="Python 代码"
            status={resolveCodeEditorStatus({
              generateError: codeGenerateError,
              testError: codeTest.error,
              testSuccess: codeTest.success,
            })}
          />
        </VStack>
      )}

      <Switch
        label="是否公开"
        description="开启后其他用户也能看到该因子"
        value={isPublic}
        onChange={setIsPublic}
      />

      {createFactor.isError && (
        <Text size="sm" style={{ color: "var(--color-text-negative)" }}>
          {(createFactor.error as Error).message}
        </Text>
      )}

      <HStack gap={2} align="center" style={{ justifyContent: "flex-end" }}>
        <Button
          label="取消"
          variant="ghost"
          isDisabled={createFactor.isPending}
          onClick={() => navigate({ to: "/home/factors" })}
        />
        <Button
          label="创建"
          variant="primary"
          isDisabled={isSubmitDisabled}
          isLoading={createFactor.isPending}
          tooltip={submitDisabledReason}
          onClick={handleSubmit}
        />
      </HStack>
    </VStack>
  );
}
