import { useEffect, useRef } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, placeholder as placeholderExtension } from "@codemirror/view";
import { baseEditorExtensions } from "../lib/codeEditorTheme";

export interface UseCodeMirrorOptions {
  value: string;
  onChange?: (value: string) => void;
  /** 只读展示（仍可选中复制） */
  isReadOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** 语言本体与语言相关扩展（如 python()、表达式轻量语法、补全源） */
  languageExtensions?: Extension[];
}

/**
 * CodeMirror 6 通用挂载逻辑：受控 value、只读切换（运行时 Compartment reconfigure）、
 * 固定的与语言无关扩展。返回需要挂到容器 div 上的 ref。
 */
export function useCodeMirror({
  value,
  onChange,
  isReadOnly = false,
  placeholder,
  ariaLabel,
  languageExtensions,
}: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const languageRef = useRef(languageExtensions);

  if (!readOnlyCompartmentRef.current) {
    readOnlyCompartmentRef.current = new Compartment();
  }
  onChangeRef.current = onChange;
  valueRef.current = value;
  languageRef.current = languageExtensions;

  useEffect(() => {
    const parent = containerRef.current;
    const readOnlyCompartment = readOnlyCompartmentRef.current;
    if (!parent || !readOnlyCompartment) return;

    const extensions: Extension[] = [
      ...baseEditorExtensions,
      ...(languageRef.current ?? []),
      readOnlyCompartment.of([
        EditorState.readOnly.of(isReadOnly),
        EditorView.editable.of(!isReadOnly),
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
      }),
    ];

    if (placeholder) extensions.push(placeholderExtension(placeholder));

    const contentAttributes: Record<string, string> = {
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
    };
    if (ariaLabel) contentAttributes["aria-label"] = ariaLabel;
    extensions.push(EditorView.contentAttributes.of(contentAttributes));

    const view = new EditorView({
      state: EditorState.create({ doc: valueRef.current, extensions }),
      parent,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    const readOnlyCompartment = readOnlyCompartmentRef.current;
    if (!view || !readOnlyCompartment) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(isReadOnly),
        EditorView.editable.of(!isReadOnly),
      ]),
    });
  }, [isReadOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return containerRef;
}
