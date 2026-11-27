import type { SignalResult } from "@ai-trader/signal-catalog/contracts";

export function selectSignalPreview(signals: readonly SignalResult[], limit = 3): SignalResult[] {
  return signals.slice(0, limit);
}

export function nextExpandedSignalId(current: string | null, next: string): string | null {
  return current === next ? null : next;
}
