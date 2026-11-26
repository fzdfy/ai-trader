export type KlineLoadStatus = "loading" | "ready" | "empty" | "error";
export const KLINE_REQUEST_TIMEOUT_MS = 15_000;

export function klineRequestSignal(
  external: AbortSignal | undefined,
  timeoutMs = KLINE_REQUEST_TIMEOUT_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external ? AbortSignal.any([external, timeout]) : timeout;
}

export function resolveKlineStatus(input: {
  bars: unknown[] | null;
  error: unknown | null;
}): KlineLoadStatus {
  if (input.error != null) return "error";
  if (input.bars == null) return "loading";
  return input.bars.length > 0 ? "ready" : "empty";
}
