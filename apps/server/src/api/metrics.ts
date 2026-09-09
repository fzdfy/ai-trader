/**
 * 指标口径 API — 挂载于 /api/v1/metrics
 *
 * 提供：
 *   GET /api/v1/metrics?kind=mainline  读取某 kind 的全部预设口径 + 口径定义元数据（前端据此渲染表单）
 *   PUT /api/v1/metrics                保存（upsert）某 kind+preset 的口径配置
 *
 * 口径结构 / 校验 / instruction 渲染 / 版本管理与事务落库全部收敛在 src/lib/metrics.ts，
 * 本文件只做 HTTP 层校验与转发（DB 逻辑复用，避免重复）。
 */
import { Hono } from "hono";
import { ok, badRequest, serverError } from "../lib/response";
import {
  METRIC_KIND_MAP,
  kindDefMeta,
  listMetrics,
  saveMetric,
} from "../lib/metrics";

const metricsRoute = new Hono();

// GET /api/v1/metrics?kind=mainline — 读取某 kind 的全部预设 + 口径定义元数据
metricsRoute.get("/", async (c) => {
  const kind = c.req.query("kind")?.trim() || "mainline";
  const def = METRIC_KIND_MAP[kind];
  if (!def) return badRequest(c, `未知指标口径 kind: ${kind}`);

  try {
    const rows = await listMetrics(kind);
    return ok(c, { kind, def: kindDefMeta(def), rows });
  } catch (err) {
    console.error(`[metrics] list error (kind=${kind}):`, err);
    return serverError(c, "口径列表获取失败，请稍后重试。");
  }
});

// PUT /api/v1/metrics — 保存（upsert）口径配置
// body: { kind, preset, displayName?, spec?, isDefault? }
metricsRoute.put("/", async (c) => {
  const body = (await c.req.json()) as {
    kind?: string;
    preset?: string;
    displayName?: string;
    spec?: unknown;
    isDefault?: boolean;
  };
  const kind = body.kind?.trim();
  const preset = body.preset?.trim();
  if (!kind || !METRIC_KIND_MAP[kind]) return badRequest(c, "未知指标口径 kind");
  if (!preset) return badRequest(c, "preset 不能为空");
  // 仅允许合法 preset 标识（字母数字 / _ / -），避免 URL/键异常
  if (!/^[a-zA-Z0-9_-]+$/.test(preset)) return badRequest(c, "preset 仅支持字母数字 / _ / -");

  try {
    // 校验失败时 saveMetric 抛携带中文错误，转为 400
    const record = await saveMetric({
      kind,
      preset,
      spec: body.spec,
      displayName: body.displayName,
      isDefault: body.isDefault,
    });
    return ok(c, record);
  } catch (err) {
    if (err instanceof Error && /未知指标口径 kind|preset|权重|归一化|候选|minScore|topN|spec/.test(err.message)) {
      return badRequest(c, err.message);
    }
    console.error("[metrics] upsert error:", err);
    return serverError(c, "口径保存失败，请稍后重试。");
  }
});

export { metricsRoute };
