import { useEffect, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { BookOpenText, Sparkles } from "lucide-react";
import {
  useGenerateFactorExpression,
  useGenerateFactorCode,
  useFactorDefinitionTesting,
  type FactorDraft,
  type FactorKind,
} from "../hooks/useFactors";
import { FactorCodeReference } from "./FactorCodeReference";
import { FactorExpressionReference } from "./FactorExpressionReference";
import { PythonCodeEditor } from "./PythonCodeEditor";
import { ExpressionCodeEditor } from "./ExpressionCodeEditor";
import { DefinitionTestBar } from "./DefinitionTestBar";
import { resolveCodeEditorStatus } from "./CodeEditorFrame";

interface FactorCreateDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: FactorDraft) => void;
}

/**
 * 创建因子弹框：name + description + 定义方式（因子表达式 / Python 代码）+ 是否公开。
 * 两种定义方式都支持通过「AI 生成」按钮，根据 description 自动生成；
 * Python 代码生成后由服务端做静态校验 + 真实库小样本运行校验。
 */
export function FactorCreateDialog({ isOpen, onOpenChange, onSubmit }: FactorCreateDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FactorKind>("expression");
  const [expression, setExpression] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [codeGenerateError, setCodeGenerateError] = useState("");

  const generateMutation = useGenerateFactorExpression();
  const generateCodeMutation = useGenerateFactorCode();

  // 新建因子没有已保存基线，必须测试通过才能创建
  const {
    expression: expressionTest,
    code: codeTest,
    reset: resetTesting,
  } = useFactorDefinitionTesting("", "");

  // 每次打开时重置表单与测试状态
  useEffect(() => {
    if (isOpen) {
      setName("");
      setKind("expression");
      setExpression("");
      setCode("");
      setDescription("");
      setIsPublic(false);
      setGenerateError("");
      setCodeGenerateError("");
      resetTesting();
    }
  }, [isOpen, resetTesting]);

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
  const isSubmitDisabled = !name.trim() || isDefinitionEmpty || !isDefinitionVerified;

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
                placeholder="简要说明该因子的含义与用途，AI 将据此生成表达式或代码"
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
                isDisabled={isSubmitDisabled}
                tooltip={submitDisabledReason}
                onClick={handleSubmit}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
