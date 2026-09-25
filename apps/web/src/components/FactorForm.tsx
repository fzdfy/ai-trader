import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Switch } from "@astryxdesign/core/Switch";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { BookOpenText, Sparkles } from "lucide-react";
import {
  useGenerateFactorExpression,
  useGenerateFactorCode,
  useFactorDefinitionTesting,
  type FactorEditDraft,
  type FactorKind,
} from "../hooks/useFactors";
import { FactorCodeReference } from "./FactorCodeReference";
import { FactorExpressionReference } from "./FactorExpressionReference";
import { PythonCodeEditor } from "./PythonCodeEditor";
import { ExpressionCodeEditor } from "./ExpressionCodeEditor";
import { DefinitionTestBar } from "./DefinitionTestBar";
import { resolveCodeEditorStatus } from "./CodeEditorFrame";

interface FactorFormProps {
  title: string;
  subtitle?: string;
  submitLabel: string;
  /** 编辑目标草稿（name 为因子唯一标识，不可修改） */
  initialValues: FactorEditDraft;
  /** 是否允许编辑（仅创建者本人为 true；他人创建的因子整表单只读） */
  canEdit: boolean;
  isSubmitting?: boolean;
  onSubmit: (input: FactorEditDraft) => void;
  onCancel: () => void;
}

/**
 * 编辑因子页面级表单：label + description + 定义方式（表达式 / Python 代码）+ 是否公开。
 * name 为因子唯一标识（主键），不可修改，仅用于定位提交。
 * 通过 canEdit 控制：本人创建可编辑，他人创建的所有输入框 disabled（只读展示）。
 */
export function FactorForm({
  title,
  subtitle,
  submitLabel,
  initialValues,
  canEdit,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: FactorFormProps) {
  const [label, setLabel] = useState(initialValues.label);
  const [kind, setKind] = useState<FactorKind>(initialValues.kind);
  const [expression, setExpression] = useState(initialValues.expression);
  const [code, setCode] = useState(initialValues.code);
  const [description, setDescription] = useState(initialValues.description);
  const [isPublic, setIsPublic] = useState(initialValues.isPublic);
  const [generateError, setGenerateError] = useState("");
  const [codeGenerateError, setCodeGenerateError] = useState("");

  const generateMutation = useGenerateFactorExpression();
  const generateCodeMutation = useGenerateFactorCode();

  // 以已保存的定义为测试基线：未改动即视为已通过（保存时服务端已校验），改动后必须重新测试
  const testing = useFactorDefinitionTesting(initialValues.expression, initialValues.code);

  // 手动修改表达式时，清空 AI 生成错误提示与旧的测试结果
  const handleExpressionChange = (value: string) => {
    if (!canEdit) return;
    setExpression(value);
    testing.expression.clear();
    if (generateError) setGenerateError("");
  };

  // 手动修改代码时，清空 AI 生成错误提示与旧的测试结果
  const handleCodeChange = (value: string) => {
    if (!canEdit) return;
    setCode(value);
    testing.code.clear();
    if (codeGenerateError) setCodeGenerateError("");
  };

  const handleGenerate = async () => {
    if (!canEdit) return;
    const desc = description.trim();
    if (!desc) return;
    try {
      const expr = await generateMutation.mutateAsync(desc);
      if (expr.includes("无法生成")) {
        setGenerateError("现有因子算子无法表达该描述，请调整描述或手动填写表达式");
      } else {
        setExpression(expr);
        testing.expression.clear();
        setGenerateError("");
      }
    } catch {
      setGenerateError("AI 生成失败，请稍后重试");
    }
  };

  // Python 代码生成：服务端生成后会做静态校验 + 真实库小样本运行校验，失败返回哨兵与原因
  const handleGenerateCode = async () => {
    if (!canEdit) return;
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
        testing.code.clear();
        setCodeGenerateError("");
      }
    } catch {
      setCodeGenerateError("AI 生成失败，请稍后重试");
    }
  };

  const isDefinitionEmpty = kind === "python" ? !code.trim() : false;
  // 保存门禁：定义未改动时沿用已保存状态（视为已通过），一旦改动就必须重新测试通过
  const isDefinitionVerified =
    kind === "expression"
      ? testing.expression.isVerified(expression)
      : testing.code.isVerified(code);
  const isSubmitDisabled = !label.trim() || isDefinitionEmpty || !isDefinitionVerified;

  let submitDisabledReason: string | undefined;
  if (!label.trim()) {
    submitDisabledReason = "请填写显示名称";
  } else if (isDefinitionEmpty) {
    submitDisabledReason = "请填写因子定义";
  } else if (!isDefinitionVerified) {
    submitDisabledReason = "请先测试通过因子定义";
  }

  const handleSubmit = () => {
    if (!canEdit || isSubmitDisabled) return;
    onSubmit({
      name: initialValues.name,
      label: label.trim(),
      description: description.trim(),
      kind,
      expression: kind === "expression" ? expression.trim() : "",
      code: kind === "python" ? code.trim() : "",
      isPublic,
    });
  };

  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        {subtitle ? <Text type="supporting">{subtitle}</Text> : null}
      </VStack>

      <Text type="supporting" size="sm">
        标识：{initialValues.name}
      </Text>

      <TextInput
        label="显示名称"
        value={label}
        onChange={setLabel}
        isRequired
        isDisabled={!canEdit}
        placeholder="如：乖离率"
        hasAutoFocus={canEdit}
      />
      <TextArea
        label="描述"
        value={description}
        onChange={setDescription}
        isDisabled={!canEdit}
        placeholder="简要说明该因子的含义与用途，AI 将据此生成表达式或代码"
      />
      <VStack gap={2}>
        <Text type="label">定义方式</Text>
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as FactorKind)}
          label="因子定义方式"
          layout="fill"
          isDisabled={!canEdit}
          disabledMessage="仅创建者可修改定义方式"
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
            {canEdit ? (
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
                  isPending={testing.expression.isPending}
                  isDisabled={!expression.trim()}
                  onTest={() => void testing.expression.test(expression)}
                />
              </HStack>
            ) : null}
          </HStack>
          <ExpressionCodeEditor
            value={expression}
            onChange={handleExpressionChange}
            isReadOnly={!canEdit}
            ariaLabel="因子表达式"
            status={resolveCodeEditorStatus({
              generateError,
              testError: testing.expression.error,
              testSuccess: testing.expression.success,
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
            {canEdit ? (
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
                  isPending={testing.code.isPending}
                  isDisabled={!code.trim()}
                  onTest={() => void testing.code.test(code)}
                />
              </HStack>
            ) : null}
          </HStack>
          <PythonCodeEditor
            value={code}
            onChange={handleCodeChange}
            isReadOnly={!canEdit}
            ariaLabel="Python 代码"
            status={resolveCodeEditorStatus({
              generateError: codeGenerateError,
              testError: testing.code.error,
              testSuccess: testing.code.success,
            })}
          />
        </VStack>
      )}

      <Switch
        label="是否公开"
        description={canEdit ? "开启后其他用户也能看到该因子" : "仅创建者可修改公开状态"}
        value={isPublic}
        onChange={setIsPublic}
        isDisabled={!canEdit}
      />

      <HStack gap={2} align="center" style={{ justifyContent: "flex-end" }}>
        <Button
          label={canEdit ? "取消" : "关闭"}
          variant="ghost"
          onClick={onCancel}
          isDisabled={isSubmitting}
        />
        {canEdit ? (
          <Button
            label={submitLabel}
            variant="primary"
            isDisabled={isSubmitDisabled}
            isLoading={isSubmitting}
            tooltip={submitDisabledReason}
            onClick={handleSubmit}
          />
        ) : null}
      </HStack>
    </VStack>
  );
}
