import { useEffect, useRef } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { tags as syntaxTags } from "@lezer/highlight";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/Stack";

const pythonLanguage = python();

/** 语法着色沿用 astryx 主题的 --color-syntax-* token，与全站代码块口径一致 */
const codeHighlightStyle = HighlightStyle.define([
  {
    tag: [
      syntaxTags.comment,
      syntaxTags.lineComment,
      syntaxTags.blockComment,
      syntaxTags.docComment,
    ],
    color: "var(--color-syntax-comment)",
    fontStyle: "italic",
  },
  {
    tag: [
      syntaxTags.keyword,
      syntaxTags.controlKeyword,
      syntaxTags.moduleKeyword,
      syntaxTags.operatorKeyword,
      syntaxTags.definitionKeyword,
    ],
    color: "var(--color-syntax-keyword)",
  },
  {
    tag: [
      syntaxTags.string,
      syntaxTags.special(syntaxTags.string),
      syntaxTags.docString,
      syntaxTags.character,
    ],
    color: "var(--color-syntax-string)",
  },
  {
    tag: [
      syntaxTags.number,
      syntaxTags.integer,
      syntaxTags.float,
      syntaxTags.regexp,
    ],
    color: "var(--color-syntax-number)",
  },
  {
    tag: [
      syntaxTags.bool,
      syntaxTags.null,
      syntaxTags.atom,
      syntaxTags.constant(syntaxTags.name),
    ],
    color: "var(--color-syntax-constant)",
  },
  {
    tag: [
      syntaxTags.function(syntaxTags.variableName),
      syntaxTags.function(syntaxTags.propertyName),
    ],
    color: "var(--color-syntax-function)",
  },
  {
    tag: [syntaxTags.propertyName],
    color: "var(--color-syntax-property)",
  },
  {
    tag: [
      syntaxTags.typeName,
      syntaxTags.className,
      syntaxTags.namespace,
      syntaxTags.self,
    ],
    color: "var(--color-syntax-type)",
  },
  {
    tag: [
      syntaxTags.variableName,
      syntaxTags.definition(syntaxTags.variableName),
      syntaxTags.name,
    ],
    color: "var(--color-syntax-variable)",
  },
  {
    tag: [syntaxTags.operator],
    color: "var(--color-syntax-operator)",
  },
  {
    tag: [
      syntaxTags.punctuation,
      syntaxTags.separator,
      syntaxTags.bracket,
      syntaxTags.brace,
      syntaxTags.squareBracket,
      syntaxTags.paren,
    ],
    color: "var(--color-syntax-punctuation)",
  },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--color-syntax-background)",
    color: "var(--color-syntax-variable)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-element)",
    overflow: "hidden",
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "var(--color-border-emphasized)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-family-code)",
    fontSize: "var(--font-size-base)",
    lineHeight: "1.6",
  },
  ".cm-content": {
    padding: "var(--spacing-3) 0",
    caretColor: "var(--color-text-primary)",
  },
  ".cm-line": {
    padding: "0 var(--spacing-3)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--color-syntax-punctuation)",
    border: "none",
    borderRight: "1px solid var(--color-border)",
    fontFamily: "var(--font-family-code)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "var(--spacing-8)",
    padding: "0 var(--spacing-2) 0 var(--spacing-3)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--color-overlay-hover)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--color-overlay-hover)",
    color: "var(--color-text-secondary)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-text-primary)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--color-accent-muted)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--color-accent-muted)",
  },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--color-accent-muted)",
    outline: "1px solid var(--color-border-emphasized)",
  },
  ".cm-placeholder": {
    color: "var(--color-text-disabled)",
    whiteSpace: "pre-wrap",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--color-background-popover)",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-inner)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--color-accent-muted)",
    color: "var(--color-text-primary)",
  },
});

interface PythonCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** 只读展示（仍可选中复制），用于未授权编辑的因子详情/表单 */
  isReadOnly?: boolean;
  placeholder?: string;
  description?: string;
  ariaLabel?: string;
  /** 编辑器可视高度（px），超出后内部滚动 */
  height?: number;
}

/**
 * 基于 CodeMirror 6 的 Python 代码编辑器：带行号与语法高亮，支持可编辑 / 只读两种模式。
 * 受控组件：value 由外部持有，用户输入通过 onChange 回传。
 */
export function PythonCodeEditor({
  value,
  onChange,
  isReadOnly = false,
  placeholder,
  description,
  ariaLabel,
  height = 280,
}: PythonCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);

  if (!readOnlyCompartmentRef.current) {
    readOnlyCompartmentRef.current = new Compartment();
  }
  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    const parent = containerRef.current;
    const readOnlyCompartment = readOnlyCompartmentRef.current;
    if (!parent || !readOnlyCompartment) return;

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      EditorState.tabSize.of(4),
      indentOnInput(),
      syntaxHighlighting(codeHighlightStyle),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      pythonLanguage,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
      ]),
      editorTheme,
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

  return (
    <VStack gap={1}>
      <div ref={containerRef} style={{ height }} />
      {description ? (
        <Text type="supporting" size="sm">
          {description}
        </Text>
      ) : null}
    </VStack>
  );
}
