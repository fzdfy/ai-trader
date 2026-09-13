/**
 * board-fund-flow 管道 — 同步板块周期资金流到 board_fund_flow_period 表。
 *
 * 数据源：quant 数据服务东方财富板块资金流（industry / concept 的 5 日口径）：
 *   quant.boardFundFlow("industry", "5d")
 *   quant.boardFundFlow("concept", "5d")
 *
 * 写入策略：upsert（date + board_type + period + code 主键，同日覆盖为当天最后一次同步结果）。
 * 上游返回 6 位裸代码（如 600519），落库前转换为标准 symbol（600519.SH），
 * 便于直接 JOIN quote_latest / bar1d_adj 等行情表。
 */

import { quant } from "../../../lib/quant";
import type { BoardFundFlowItem } from "../../../lib/quant";
import { db } from "../../../db";
import { boardFundFlowPeriod } from "../../../db/schema";
import { sql } from "drizzle-orm";
import { updateProgress } from "../progress";
import { localDateStr } from "../calendar";

/** 东财原始 6 位代码 → 标准 symbol（60x/68x→.SH，00x/30x→.SZ，43/83/87/88/92→.BJ） */
function codeToSymbol(code: string): string {
  if (code.includes(".")) return code;
  if (/^(60|68)/.test(code)) return `${code}.SH`;
  if (/^(00|30)/.test(code)) return `${code}.SZ`;
  if (/^(43|83|87|88|92)/.test(code)) return `${code}.BJ`;
  return `${code}.SH`;
}

/** 数值统一为 string | null，与 drizzle numeric 列的插入类型保持一致 */
function toStr(v: number | null | undefined): string | null {
  return v == null ? null : String(v);
}

/** upsert 单个 boardType 的 5 日资金流，返回写入条数 */
async function upsertBoardFundFlow5d(
  today: string,
  boardType: "industry" | "concept",
  rows: BoardFundFlowItem[],
): Promise<number> {
  const values = rows.map((r, i) => ({
    date: today,
    boardType,
    period: "5d" as const,
    code: r.code,
    name: r.name,
    rank: i + 1,
    changePercent: toStr(r.change_pct),
    mainNetInflow: toStr(r.main_net),
    mainNetInflowPercent: toStr(r.main_pct),
    topStockCode: r.top_stock_code ? codeToSymbol(r.top_stock_code) : null,
    topStockName: r.top_stock_name || null,
    updatedAt: new Date(),
  }));
  for (let j = 0; j < values.length; j += 200) {
    await db
      .insert(boardFundFlowPeriod)
      .values(values.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [
          boardFundFlowPeriod.date,
          boardFundFlowPeriod.boardType,
          boardFundFlowPeriod.period,
          boardFundFlowPeriod.code,
        ],
        set: {
          rank: sql.raw("excluded.rank"),
          name: sql.raw("excluded.name"),
          changePercent: sql.raw("excluded.change_percent"),
          mainNetInflow: sql.raw("excluded.main_net_inflow"),
          mainNetInflowPercent: sql.raw("excluded.main_net_inflow_percent"),
          topStockCode: sql.raw("excluded.top_stock_code"),
          topStockName: sql.raw("excluded.top_stock_name"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }
  return values.length;
}

export async function boardFundFlowPipeRun(): Promise<void> {
  const today = localDateStr();

  // 并行拉取 industry / concept 两个 boardType 的 5 日资金流，各自容错
  const [industry, concept] = await Promise.all([
    quant
      .boardFundFlow("industry", "5d")
      .then((r) => r.rows)
      .catch((e) => {
        console.error("[board-fund-flow] industry 5d fetch failed:", (e as Error).message ?? e);
        return null;
      }),
    quant
      .boardFundFlow("concept", "5d")
      .then((r) => r.rows)
      .catch((e) => {
        console.error("[board-fund-flow] concept 5d fetch failed:", (e as Error).message ?? e);
        return null;
      }),
  ]);

  if ((industry?.length ?? 0) === 0 && (concept?.length ?? 0) === 0) {
    throw new Error("[board-fund-flow] 板块5日资金流均无数据，未写入任何记录");
  }

  const TOTAL_STAGES = 2;
  updateProgress(0, TOTAL_STAGES, "开始同步板块5日资金流");

  const industryCount = await upsertBoardFundFlow5d(today, "industry", industry ?? []);
  updateProgress(1, TOTAL_STAGES, `行业5日资金流完成（${industryCount} 条）`);

  const conceptCount = await upsertBoardFundFlow5d(today, "concept", concept ?? []);
  updateProgress(2, TOTAL_STAGES, `概念5日资金流完成（${conceptCount} 条）`);

  console.log(
    `[board-fund-flow] done. industry: ${industryCount}, concept: ${conceptCount} (snapshot ${today})`,
  );

  // 部分源失败：成功部分已 upsert（幂等），抛出让 wrapJob 标记 failed 触发重试补齐
  if (industry == null || concept == null) {
    const failed = [industry == null ? "industry5d" : null, concept == null ? "concept5d" : null].filter(
      (x): x is string => x != null,
    );
    throw new Error(`[board-fund-flow] 部分数据源失败（${failed.join("; ")}），已写入成功部分，等待重试`);
  }
}
