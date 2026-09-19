// 因子预计算管道：收盘后触发 quant 服务重算因子并落库（feature_value 表）。
//
// 因子计算逻辑在 Python quant 服务（factors/registry.py），
// 本管道仅通过 HTTP 触发 quant 的 POST /api/v1/features/compute 端点。

const QUANT_URL = process.env.QUANT_URL ?? "http://localhost:3002";

export async function featuresPipeRun(): Promise<void> {
  const res = await fetch(`${QUANT_URL}/api/v1/features/compute`, {
    method: "POST",
    // 因子计算为全市场重算，耗时较长；设置上限避免 quant 服务 hang 时任务永久卡在 running
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[features] compute failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { symbols?: number; rows?: number };
  const symbols = json.symbols ?? 0;
  const rows = json.rows ?? 0;
  console.log(`[features] done: ${symbols} symbols, ${rows} rows`);

  // 有自选标的却未写入任何特征行：说明 kline-1d 数据不足或因子计算异常，
  // 属「未同步完全」，抛错触发 deadline 重试，避免静默 success 后当日被幂等跳过。
  if (symbols > 0 && rows === 0) {
    throw new Error(`[features] ${symbols} 只标的均未写入特征行，任务未完全成功`);
  }
}
