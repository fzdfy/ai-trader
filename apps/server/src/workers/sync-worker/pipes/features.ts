// 因子预计算管道：收盘后触发 quant 服务重算因子并落库（feature_value 表）。
//
// 因子计算逻辑在 Python quant 服务（factors/registry.py），
// 本管道仅通过 HTTP 触发 quant 的 POST /api/v1/features/compute 端点。

const QUANT_URL = process.env.QUANT_URL ?? "http://localhost:3002";

export async function featuresPipeRun(): Promise<void> {
  const res = await fetch(`${QUANT_URL}/api/v1/features/compute`, { method: "POST" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[features] compute failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { symbols?: number; rows?: number };
  console.log(`[features] done: ${json.symbols ?? 0} symbols, ${json.rows ?? 0} rows`);
}
