import type { ReactNode, RefObject } from "react";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { FieldStatus } from "@astryxdesign/core/FieldStatus";

export interface CodeEditorStatus {
  type: "error" | "warning" | "success";
  message: string;
}

/**
 * 按优先级合并编辑器下方的状态提示：AI 生成错误 > 测试错误 > 测试成功。
 * 三者皆无时返回 undefined，此时由 description 作为普通说明展示。
 */
export function resolveCodeEditorStatus(sources: {
  generateError?: string;
  testError?: string;
  testSuccess?: string;
}): CodeEditorStatus | undefined {
  if (sources.generateError) return { type: "error", message: sources.generateError };
  if (sources.testError) return { type: "error", message: sources.testError };
  if (sources.testSuccess) return { type: "success", message: sources.testSuccess };
  return undefined;
}

interface CodeEditorFrameProps {
  /** 由 useCodeMirror 返回、需挂到容器上的 ref */
  containerRef: RefObject<HTMLDivElement | null>;
  height: number;
  description?: string;
  /** 校验状态（优先级高于 description），与 Astryx 表单控件口径一致 */
  status?: CodeEditorStatus;
}

/**
 * 代码编辑器的外壳：容器 + 下方说明 / 校验提示。
 * CodeMirror 自身不带 Astryx 的 FieldStatus，这里补齐错误反馈的展示。
 */
export function CodeEditorFrame({
  containerRef,
  height,
  description,
  status,
}: CodeEditorFrameProps) {
  let footer: ReactNode = null;
  if (status) {
    footer = <FieldStatus type={status.type} message={status.message} variant="detached" />;
  } else if (description) {
    footer = (
      <Text type="supporting" size="sm">
        {description}
      </Text>
    );
  }

  return (
    <VStack gap={1}>
      <div ref={containerRef} style={{ height }} />
      {footer}
    </VStack>
  );
}
