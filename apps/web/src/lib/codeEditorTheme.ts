import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
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
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { tags as syntaxTags } from "@lezer/highlight";

/** 语法着色沿用 astryx 主题的 --color-syntax-* token，与全站代码块口径一致 */
export const codeHighlightStyle = HighlightStyle.define([
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

export const codeEditorTheme = EditorView.theme({
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

/**
 * 与语言无关的编辑能力（行号、历史、选区、括号匹配、快捷键、主题）。
 * 语言本体与补全源由各编辑器通过 languageExtensions 追加。
 */
export const baseEditorExtensions: Extension[] = [
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
  rectangularSelection(),
  highlightActiveLine(),
  EditorView.lineWrapping,
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...completionKeymap,
  ]),
  codeEditorTheme,
];
