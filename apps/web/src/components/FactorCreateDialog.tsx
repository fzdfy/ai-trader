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
  type FactorDraft,
  type FactorKind,
} from "../hooks/useFactors";
import { FactorCodeReference, PYTHON_FACTOR_TEMPLATE } from "./FactorCodeReference";

interface FactorCreateDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: FactorDraft) => void;
}

/**
 * 创建因子弹框：name + description + 定义方式（因子表达式 / Python 代码）+ 是否公开。
 * 表达式方式支持通过「AI 生成」按钮，根据 description 自动生成。
 */
export function FactorCreateDialog({ isOpen, onOpenChange, onSubmit }: FactorCreateDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FactorKind>("expression");
  const [expression, setExpression] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const generateMutation = useGenerateFactorExpression();

  // 每次打开时重置表单
  useEffect(() => {
    if (isOpen) {
      setName("");
      setKind("expression");
      setExpression("");
      setCode("");
      setDescription("");
      setIsPublic(false);
      setGenerateError("");
    }
  }, [isOpen]);

  // 手动修改表达式时，清空 AI 生成错误提示
  const handleExpressionChange = (value: string) => {
    setExpression(value);
    if (generateError) setGenerateError("");
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
        setGenerateError("");
      }
    } catch {
      setGenerateError("AI 生成失败，请稍后重试");
    }
  };

  const isDefinitionEmpty = kind === "python" ? !code.trim() : false;

  const handleSubmit = () => {
    if (!name.trim() || isDefinitionEmpty) return;
    onSubmit({
      name: name.trim(),
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
        header={<DialogHeader title="创建因子" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={4}>
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
                placeholder="简要说明该因子的含义与用途，AI 将据此生成表达式"
              />
              <VStack gap={2}>
                <Text type="label">定义方式</Text>
                <SegmentedControl
                  value={kind}
                  onChange={(v) => setKind(v as FactorKind)}
                  label="因子定义方式"
                  layout="fill"
                >
                  <SegmentedControlItem value="expression" label="因子表达式" />
                  <SegmentedControlItem value="python" label="Python 代码" />
                </SegmentedControl>
              </VStack>

              {kind === "expression" ? (
                <VStack gap={1}>
                  <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
                    <Text type="label">因子表达式</Text>
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
                  </HStack>
                  <TextArea
                    label="因子表达式"
                    isLabelHidden
                    value={expression}
                    onChange={handleExpressionChange}
                    placeholder="如：Close / Ref(Close, 5) - 1"
                    description="AKQuant 表达式，可点击「AI 生成」根据描述自动生成"
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
                    <Button
                      label="填充示例"
                      size="sm"
                      variant="secondary"
                      onClick={() => setCode(PYTHON_FACTOR_TEMPLATE)}
                    />
                  </HStack>
                  <TextArea
                    label="Python 代码"
                    isLabelHidden
                    value={code}
                    onChange={setCode}
                    rows={12}
                    placeholder={PYTHON_FACTOR_TEMPLATE}
                    description="需定义 compute(data) 函数，返回因子值序列"
                    style={{ fontFamily: "var(--font-family-code)" }}
                  />
                </VStack>
              )}

              <Switch
                label="是否公开"
                description="开启后其他用户也能看到该因子"
                value={isPublic}
                onChange={setIsPublic}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} align="center" style={{ justifyContent: "flex-end" }}>
              <Button label="取消" variant="ghost" onClick={() => onOpenChange(false)} />
              <Button
                label="创建"
                variant="primary"
                isDisabled={!name.trim() || isDefinitionEmpty}
                onClick={handleSubmit}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
