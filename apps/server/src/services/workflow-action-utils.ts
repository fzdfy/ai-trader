export class WorkflowActionError extends Error {
  readonly status: 400 | 404 | 409 | 500 | 502;

  constructor(message: string, status: 400 | 404 | 409 | 500 | 502) {
    super(message);
    this.name = "WorkflowActionError";
    this.status = status;
  }
}

export function uniqueWorkflowSymbols(symbols: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const symbol of symbols) {
    const value = symbol.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function normalizeWorkflowSymbols(symbols: readonly string[]): string[] {
  return uniqueWorkflowSymbols(symbols).slice(0, 50);
}

export function summarizeBacktestResults<T extends { ok: boolean }>(
  results: readonly T[],
): {
  total: number;
  succeeded: number;
  failed: number;
  results: T[];
} {
  const succeeded = results.filter((result) => result.ok).length;
  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results: [...results],
  };
}
