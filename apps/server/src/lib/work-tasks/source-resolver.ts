import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  instrument,
  reviewDaily,
  stockPool,
  workflowDefinition,
  workflowRun,
} from "../../db/schema";
import type { WorkTaskSourceType } from "./contracts";
import type { ResolvedWorkTaskSource } from "./service";

export async function resolveWorkTaskSource(
  userId: string,
  sourceType: WorkTaskSourceType,
  sourceId: string,
): Promise<ResolvedWorkTaskSource | null> {
  if (sourceType === "stock") {
    const [row] = await db
      .select({
        symbol: instrument.symbol,
        name: instrument.name,
      })
      .from(instrument)
      .where(eq(instrument.symbol, sourceId))
      .limit(1);
    if (!row) return null;
    return {
      sourceType,
      sourceId: row.symbol,
      contextJson: {
        title: `${row.name} ${row.symbol}`,
        subtitle: "个股分析",
        symbol: row.symbol,
        name: row.name,
        url: `/home/market/analysis/${encodeURIComponent(row.symbol)}`,
      },
    };
  }

  if (sourceType === "review") {
    const [row] = await db
      .select({
        date: reviewDaily.date,
        summary: reviewDaily.summary,
      })
      .from(reviewDaily)
      .where(eq(reviewDaily.date, sourceId))
      .limit(1);
    if (!row) return null;
    return {
      sourceType,
      sourceId: row.date,
      contextJson: {
        title: `${row.date} 每日复盘`,
        subtitle: row.summary.slice(0, 120),
        date: row.date,
        url: `/home/reviews/history/${encodeURIComponent(row.date)}`,
      },
    };
  }

  if (sourceType === "screen") {
    const [date, rawSymbol] = sourceId.includes("|")
      ? sourceId.split("|", 2)
      : [null, sourceId];
    const where = date
      ? and(eq(stockPool.date, date), eq(stockPool.symbol, rawSymbol))
      : eq(stockPool.symbol, rawSymbol);
    const [row] = await db
      .select()
      .from(stockPool)
      .where(where)
      .orderBy(desc(stockPool.date))
      .limit(1);
    if (!row) return null;
    return {
      sourceType,
      sourceId: `${row.date}|${row.symbol}`,
      contextJson: {
        title: `${row.name} ${row.symbol}`,
        subtitle: [row.date, row.source, row.score].filter(Boolean).join(" · "),
        date: row.date,
        symbol: row.symbol,
        name: row.name,
        strategy: row.source,
        score: row.score,
        url: "/home/screens",
      },
    };
  }

  const runId = Number(sourceId);
  if (!Number.isInteger(runId) || runId <= 0) return null;
  const [row] = await db
    .select({
      id: workflowRun.id,
      status: workflowRun.status,
      error: workflowRun.error,
      createdAt: workflowRun.createdAt,
      workflowName: workflowDefinition.name,
    })
    .from(workflowRun)
    .innerJoin(
      workflowDefinition,
      eq(workflowRun.workflowId, workflowDefinition.id),
    )
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    sourceType,
    sourceId: String(row.id),
    contextJson: {
      title: row.workflowName,
      subtitle: `Workflow Run #${row.id} · ${row.status}`,
      runId: row.id,
      status: row.status,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      url: `/home/workflows/runs/${row.id}`,
    },
  };
}
