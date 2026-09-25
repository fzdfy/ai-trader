import type { Extension } from "@codemirror/state";
import {
  StreamLanguage,
  type StreamParser,
  type StringStream,
} from "@codemirror/language";
import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { AKQUANT_COLUMNS, AKQUANT_OPERATOR_GROUPS } from "./akquantFactors";

interface AkquantExpressionOperator {
  name: string;
  alias?: string;
  signature: string;
  description: string;
}

/** 算子名 / 别名 / 列名 / 关键字，统一从「因子表达式参考数据」推导，避免两处维护 */
const EXPRESSION_OPERATORS: AkquantExpressionOperator[] = AKQUANT_OPERATOR_GROUPS.flatMap(
  (group) =>
    group.operators.map((operator) => ({
      name: operator.signature.slice(0, operator.signature.indexOf("(")),
      alias: operator.alias,
      signature: operator.signature,
      description: operator.description,
    })),
);

const OPERATOR_NAMES = new Set<string>();
for (const operator of EXPRESSION_OPERATORS) {
  OPERATOR_NAMES.add(operator.name.toLowerCase());
  if (operator.alias) OPERATOR_NAMES.add(operator.alias.toLowerCase());
}

const COLUMN_NAMES = new Set(AKQUANT_COLUMNS.map((column) => column.toLowerCase()));

const KEYWORDS = new Set(["if", "else"]);

const IDENTIFIER_PATTERN = /^[A-Za-z_]\w*/;
const NUMBER_PATTERN = /^\d+(\.\d+)?/;
const DOUBLE_OPERATOR_PATTERN = /^\*\*|^<=|^>=|^==|^!=/;
const SINGLE_OPERATOR_PATTERN = /^[+\-*/%<>]/;
const PUNCTUATION_PATTERN = /^[(),]/;

/**
 * AKQuant 表达式极简分词器：表达式无现成语法包，此处只做轻量着色，
 * 识别列名、算子名、三元关键字、数字、运算符与标点。
 */
function tokenAkquantExpression(stream: StringStream): string | null {
  if (stream.eatSpace()) return null;

  const identifier = stream.match(IDENTIFIER_PATTERN);
  if (identifier) {
    const word = stream.current();
    const lower = word.toLowerCase();
    if (KEYWORDS.has(lower)) return "keyword";
    if (COLUMN_NAMES.has(lower)) return "variableName.constant";
    if (OPERATOR_NAMES.has(lower)) return "variableName.function";
    return "variableName";
  }

  const number = stream.match(NUMBER_PATTERN);
  if (number) return "number";

  const doubleOperator = stream.match(DOUBLE_OPERATOR_PATTERN);
  if (doubleOperator) return "operator";

  const singleOperator = stream.match(SINGLE_OPERATOR_PATTERN);
  if (singleOperator) return "operator";

  const punctuation = stream.match(PUNCTUATION_PATTERN);
  if (punctuation) return "punctuation";

  stream.next();
  return null;
}

const akquantExpressionParser: StreamParser<null> = {
  name: "akquant-expression",
  startState: () => null,
  token: tokenAkquantExpression,
};

export const akquantExpressionLanguage = StreamLanguage.define(akquantExpressionParser);

const columnCompletions: Completion[] = AKQUANT_COLUMNS.map((column) => ({
  label: column,
  type: "constant",
  detail: "数据列",
}));

const operatorCompletions: Completion[] = EXPRESSION_OPERATORS.flatMap((operator) => {
  const items: Completion[] = [
    snippetCompletion(`${operator.name}(\${})`, {
      label: operator.name,
      type: "function",
      detail: operator.description,
      info: operator.signature,
    }),
  ];
  if (operator.alias) {
    items.push(
      snippetCompletion(`${operator.alias}(\${})`, {
        label: operator.alias,
        type: "function",
        detail: `别名 · ${operator.description}`,
        info: operator.signature,
      }),
    );
  }
  return items;
});

const keywordCompletions: Completion[] = [
  { label: "if", type: "keyword", detail: "条件表达式：x if cond else y" },
  { label: "else", type: "keyword", detail: "条件表达式：x if cond else y" },
];

const EXPRESSION_COMPLETIONS: Completion[] = [
  ...keywordCompletions,
  ...operatorCompletions,
  ...columnCompletions,
];

function akquantExpressionCompletion(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_]\w*/);
  if (!word) {
    if (!context.explicit) return null;
    return { from: context.pos, options: EXPRESSION_COMPLETIONS };
  }
  if (word.from === word.to && !context.explicit) return null;
  return {
    from: word.from,
    options: EXPRESSION_COMPLETIONS,
    validFor: /^[A-Za-z_]\w*$/,
  };
}

/** AKQuant 表达式的语言本体 + 算子 / 列名补全 */
export const akquantExpressionExtensions: Extension[] = [
  akquantExpressionLanguage,
  autocompletion({ override: [akquantExpressionCompletion] }),
];
