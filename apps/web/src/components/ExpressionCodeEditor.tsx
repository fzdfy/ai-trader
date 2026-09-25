import { useCodeMirror } from "../hooks/useCodeMirror";
import { akquantExpressionExtensions } from "../lib/akquantExpressionMode";
import { CodeEditorFrame, type CodeEditorStatus } from "./CodeEditorFrame";

interface ExpressionCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** 只读展示（仍可选中复制），用于因子详情页 */
  isReadOnly?: boolean;
  placeholder?: string;
  description?: string;
  /** 校验状态（如 AI 生成失败），优先于 description 展示 */
  status?: CodeEditorStatus;
  ariaLabel?: string;
  /** 编辑器可视高度（px），超出后内部滚动 */
  height?: number;
}

/**
 * 基于 CodeMirror 6 的 AKQuant 因子表达式编辑器：轻量语法高亮（列名 / 算子 / 数字 / 运算符）
 * 与算子、列名智能补全，支持可编辑 / 只读两种模式。受控组件。
 */
export function ExpressionCodeEditor({
  value,
  onChange,
  isReadOnly = false,
  placeholder,
  description,
  status,
  ariaLabel,
  height = 96,
}: ExpressionCodeEditorProps) {
  const containerRef = useCodeMirror({
    value,
    onChange,
    isReadOnly,
    placeholder,
    ariaLabel,
    languageExtensions: akquantExpressionExtensions,
  });

  return (
    <CodeEditorFrame
      containerRef={containerRef}
      height={height}
      description={description}
      status={status}
    />
  );
}
