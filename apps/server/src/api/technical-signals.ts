import { Hono } from "hono";
import { z } from "zod";

import { catalog, type SignalScope } from "../../../../packages/signal-catalog/src/index.ts";
import {
  readStockTechnicalSignalSummaries,
  readSectorTechnicalSignalSummaries,
  readTechnicalSignalSnapshot,
  type SignalObjectIdentity,
  type StoredTechnicalSignalSnapshot,
  type StockTechnicalSignalSummary,
} from "../lib/technical-signals/store.ts";
import { normalizeStockSymbol } from "../lib/stock-analysis-data.ts";
import { badRequest, notFound, ok, serverError } from "../lib/response";

const scopeSchema = z.enum(["market", "sector", "stock", "gold"]);
const layerSchema = z.enum(["basic", "pattern", "advanced", "micro"]);
const subtypeSchema = z.enum(["industry", "concept"]);

type SnapshotReader = (
  identity: SignalObjectIdentity,
  options: { asOf?: string; catalogVersion?: string },
) => Promise<StoredTechnicalSignalSnapshot | null>;
type StockSummaryReader = (symbols: readonly string[]) => Promise<StockTechnicalSignalSummary[]>;
type SectorSummaryReader = (
  codes: readonly string[],
  subtype: "industry" | "concept",
) => Promise<StockTechnicalSignalSummary[]>;

const parseIdentity = (
  scope: string,
  objectCode: string,
  subtype: string | undefined,
): SignalObjectIdentity | string => {
  const parsedScope = scopeSchema.safeParse(scope);
  if (!parsedScope.success) return "不支持的信号对象类型";
  if (!objectCode.trim() || objectCode.length > 40) return "对象代码不合法";
  if (parsedScope.data === "sector") {
    const parsedSubtype = subtypeSchema.safeParse(subtype);
    if (!parsedSubtype.success) {
      return "板块分析必须指定 subtype=industry|concept";
    }
    if (!/^BK\d+$/i.test(objectCode)) {
      return "板块代码必须是 BK 编号";
    }
    return {
      objectType: parsedScope.data,
      objectSubtype: parsedSubtype.data,
      objectCode,
    };
  }
  if (subtype) return "非板块对象不接受 subtype";
  if (parsedScope.data === "market" && objectCode !== "000001.SH") {
    return "当前大盘技术基准固定为 000001.SH";
  }
  if (parsedScope.data === "gold" && objectCode !== "XAUUSD") {
    return "当前黄金技术对象固定为 XAUUSD";
  }
  if (parsedScope.data === "stock" && !/^\d{6}\.(SH|SZ|BJ)$/.test(objectCode)) {
    return "个股代码格式必须为 000000.SH|SZ|BJ";
  }
  return {
    objectType: parsedScope.data,
    objectSubtype: null,
    objectCode,
  };
};

export function createTechnicalSignalsRoute(
  readSnapshot: SnapshotReader = readTechnicalSignalSnapshot,
  readStockSummaries: StockSummaryReader = readStockTechnicalSignalSummaries,
  readSectorSummaries: SectorSummaryReader = readSectorTechnicalSignalSummaries,
) {
  const route = new Hono();

  route.get("/catalog", (c) => {
    const scope = c.req.query("scope");
    const layer = c.req.query("layer");
    const parsedScope = scope ? scopeSchema.safeParse(scope) : null;
    const parsedLayer = layer ? layerSchema.safeParse(layer) : null;
    if (scope && !parsedScope?.success) return badRequest(c, "scope 不合法");
    if (layer && !parsedLayer?.success) return badRequest(c, "layer 不合法");
    return ok(c, {
      catalogVersion: catalog.catalogVersion,
      signals: catalog.signals.filter(
        (signal) =>
          (!parsedScope?.success || signal.scope === parsedScope.data) &&
          (!parsedLayer?.success || signal.layer === parsedLayer.data),
      ),
    });
  });

  route.get("/stocks", async (c) => {
    const symbols = [
      ...new Set(
        (c.req.query("symbols") ?? "")
          .split(",")
          .map((symbol) => normalizeStockSymbol(symbol))
          .filter((symbol): symbol is string => symbol != null),
      ),
    ];
    if (symbols.length === 0) return badRequest(c, "请提供股票代码");
    if (symbols.length > 10) {
      return badRequest(c, "个股信号摘要一次最多查询当前页 10 只股票");
    }
    try {
      return ok(c, await readStockSummaries(symbols));
    } catch (error) {
      console.error("[technical-signals] stock summary read failed:", error);
      return serverError(c, "个股技术信号摘要读取失败");
    }
  });

  route.get("/boards", async (c) => {
    const parsedSubtype = subtypeSchema.safeParse(c.req.query("subtype"));
    if (!parsedSubtype.success) {
      return badRequest(c, "板块摘要必须指定 subtype=industry|concept");
    }
    const codes = [
      ...new Set(
        (c.req.query("codes") ?? "")
          .split(",")
          .map((code) => code.trim())
          .filter(Boolean),
      ),
    ];
    if (codes.length === 0) return badRequest(c, "请提供板块代码");
    if (codes.length > 50) {
      return badRequest(c, "板块信号摘要一次最多查询当前页 50 个板块");
    }
    try {
      return ok(c, await readSectorSummaries(codes, parsedSubtype.data));
    } catch (error) {
      console.error("[technical-signals] board summary read failed:", error);
      return serverError(c, "板块技术信号摘要读取失败");
    }
  });

  route.get("/:scope/:objectCode/:signalId", async (c) => {
    const identity = parseIdentity(
      c.req.param("scope"),
      c.req.param("objectCode"),
      c.req.query("subtype"),
    );
    if (typeof identity === "string") return badRequest(c, identity);
    const signalId = c.req.param("signalId");
    const definition = catalog.signals.find(
      (signal) =>
        signal.signalId === signalId && signal.scope === (identity.objectType as SignalScope),
    );
    if (!definition) return badRequest(c, "signalId 不在当前对象目录中");
    try {
      const snapshot = await readSnapshot(identity, {
        asOf: c.req.query("asOf"),
        catalogVersion: c.req.query("catalogVersion"),
      });
      if (!snapshot) return notFound(c, "未找到技术信号快照");
      const signal = snapshot.signals.find((item) => item.signalId === signalId);
      if (!signal) return notFound(c, "该快照中不存在此信号");
      return ok(c, {
        ...signal,
        snapshotAsOf: snapshot.asOf,
        snapshotCatalogVersion: snapshot.catalogVersion,
      });
    } catch (error) {
      console.error("[technical-signals] single signal read failed:", error);
      return serverError(c, "技术信号读取失败");
    }
  });

  route.get("/:scope/:objectCode", async (c) => {
    const identity = parseIdentity(
      c.req.param("scope"),
      c.req.param("objectCode"),
      c.req.query("subtype"),
    );
    if (typeof identity === "string") return badRequest(c, identity);
    try {
      const snapshot = await readSnapshot(identity, {
        asOf: c.req.query("asOf"),
        catalogVersion: c.req.query("catalogVersion"),
      });
      return snapshot ? ok(c, snapshot) : notFound(c, "未找到技术信号快照");
    } catch (error) {
      console.error("[technical-signals] object detail read failed:", error);
      return serverError(c, "技术信号读取失败");
    }
  });

  return route;
}

export const technicalSignalsRoute = createTechnicalSignalsRoute();
