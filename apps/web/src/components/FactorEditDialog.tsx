import { useEffect, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Sparkles } from "lucide-react";
import { useGenerateFactorExpression, type Factor } from "../hooks/useFactors";

interface FactorEditDialogProps {
  factor: Factor | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    name: string;
    label: string;
    expression: string;
    description: string;
    isPublic: boolean;
  }) => void;
}

/**
 * 编辑因子弹框：label + description + expression + 是否公开。
 * name 为因子唯一标识（主键），不可修改，仅用于定位提交。
 * expression 支持通过「AI 生成」按钮，根据 description 自动生成。
 */
export function FactorEditDialog({ factor, isOpen, onOpenChange, onSubmit }: FactorEditDialogProps) {
  const [label, setLabel] = useState("");
  const [expression, setExpression] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const generateMutation = useGenerateFactorExpression();

  // 每次打开时用当前因子数据预填表单
  useEffect(() => {
    if (isOpen && factor) {
      setLabel(factor.label);
      setExpression(factor.expression ?? "");
      setDescription(factor.description ?? "");
      setIsPublic(factor.isPublic);
      setGenerateError("");
    }
  }, [isOpen, factor]);

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

  const handleSubmit = () => {
    if (!factor || !label.trim()) return;
    onSubmit({
      name: factor.name,
      label: label.trim(),
      expression: expression.trim(),
      description: description.trim(),
      isPublic,
    });
    onOpenChange(false);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={480}>
      <Layout
        header={<DialogHeader title="编辑因子" onOpenChange={onOpenChange} />}
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
                placeholder="如：乖离率"
                hasAutoFocus
              />
              <TextArea
                label="描述"
                value={description}
                onChange={setDescription}
                placeholder="简要说明该因子的含义与用途，AI 将据此生成表达式"
              />
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
              <Button label="保存" variant="primary" isDisabled={!label.trim()} onClick={handleSubmit} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
