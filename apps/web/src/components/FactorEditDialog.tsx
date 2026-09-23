import { useEffect, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Sparkles } from "lucide-react";
import {
  useGenerateFactorExpression,
  normalizeFactorKind,
  type Factor,
  type FactorEditDraft,
  type FactorKind,
} from "../hooks/useFactors";
import { FactorCodeReference, PYTHON_FACTOR_TEMPLATE } from "./FactorCodeReference";

interface FactorEditDialogProps {
  factor: Factor | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** 是否允许编辑（仅创建者本人为 true；他人创建的因子整表单只读） */
  canEdit: boolean;
  onSubmit: (input: FactorEditDraft) => void;
}

/**
 * 因子编辑弹框：label + description + 定义方式（表达式 / Python 代码）+ 是否公开。
 * name 为因子唯一标识（主键），不可修改，仅用于定位提交。
 * 通过 canEdit 控制：本人创建可编辑，他人创建的所有输入框 disabled（只读展示）。
 */
export function FactorEditDialog({
  factor,
  isOpen,
  onOpenChange,
  canEdit,
  onSubmit,
}: FactorEditDialogProps) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<FactorKind>("expression");
  const [expression, setExpression] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const generateMutation = useGenerateFactorExpression();

  // 每次打开时用当前因子数据预填表单
  useEffect(() => {
    if (isOpen && factor) {
      setLabel(factor.label);
      setKind(normalizeFactorKind(factor.kind));
      setExpression(factor.expression ?? "");
      setCode(factor.code ?? "");
      setDescription(factor.description ?? "");
      setIsPublic(factor.isPublic);
      setGenerateError("");
    }
  }, [isOpen, factor]);

  // 手动修改表达式时，清空 AI 生成错误提示
  const handleExpressionChange = (value: string) => {
    if (!canEdit) return;
    setExpression(value);
    if (generateError) setGenerateError("");
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
        setGenerateError("");
      }
    } catch {
      setGenerateError("AI 生成失败，请稍后重试");
    }
  };

  const isDefinitionEmpty = kind === "python" ? !code.trim() : false;

  const handleSubmit = () => {
    if (!canEdit || !factor || !label.trim() || isDefinitionEmpty) return;
    onSubmit({
      name: factor.name,
      label: label.trim(),
      description: description.trim(),
      kind,
      expression: kind === "expression" ? expression.trim() : "",
      code: kind === "python" ? code.trim() : "",
      isPublic,
    });
    onOpenChange(false);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={480}>
      <Layout
        header={
          <DialogHeader title={canEdit ? "编辑因子" : "因子详情"} onOpenChange={onOpenChange} />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <Text type="supporting" size="sm">
                标识：{factor?.name}
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
                placeholder="简要说明该因子的含义与用途，AI 将据此生成表达式"
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
                    <Text type="label">因子表达式</Text>
                    {canEdit ? (
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
                    ) : null}
                  </HStack>
                  <TextArea
                    label="因子表达式"
                    isLabelHidden
                    value={expression}
                    onChange={handleExpressionChange}
                    isDisabled={!canEdit}
                    placeholder="如：Close / Ref(Close, 5) - 1"
                    description={
                      canEdit ? "AKQuant 表达式，可点击「AI 生成」根据描述自动生成" : undefined
                    }
                    status={generateError ? { type: "error", message: generateError } : undefined}
                  />
                </VStack>
              ) : (
                <VStack gap={1}>
                  <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
                    <HoverCard
                      content={<FactorCodeReference />}
                      placement="below"
                      alignment="start"
                      hasHoverIndication
                    >
                      <Text type="label">Python 代码</Text>
                    </HoverCard>
                    {canEdit ? (
                      <Button
                        label="填充示例"
                        size="sm"
                        variant="secondary"
                        onClick={() => setCode(PYTHON_FACTOR_TEMPLATE)}
                      />
                    ) : null}
                  </HStack>
                  <TextArea
                    label="Python 代码"
                    isLabelHidden
                    value={code}
                    onChange={setCode}
                    rows={12}
                    isDisabled={!canEdit}
                    placeholder={PYTHON_FACTOR_TEMPLATE}
                    description={canEdit ? "需定义 compute(data) 函数，返回因子值序列" : undefined}
                    style={{ fontFamily: "var(--font-family-code)" }}
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
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} align="center" style={{ justifyContent: "flex-end" }}>
              <Button
                label={canEdit ? "取消" : "关闭"}
                variant="ghost"
                onClick={() => onOpenChange(false)}
              />
              {canEdit ? (
                <Button
                  label="保存"
                  variant="primary"
                  isDisabled={!label.trim() || isDefinitionEmpty}
                  onClick={handleSubmit}
                />
              ) : null}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
