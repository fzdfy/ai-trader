import { createTool } from "@mastra/core/tools";
import { and, desc, eq, ilike, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db";
import { researchReport, researchReportChunk } from "../../../db/schema";
import { quant } from "../../../lib/quant";

export const researchReportTool = createTool({
  id: "searchResearchReports",
  description:
    "按标的、发布日期和主题检索已入库研报，返回标题、机构、发布日期、页码、原文片段和来源。回答必须保留这些引用。",
  inputSchema: z.object({
    symbol: z.string().describe("A 股代码，如 002594.SZ"),
    query: z.string().optional().describe("主题关键词，如海外、盈利、估值、风险"),
    asOf: z.string().optional().describe("只使用不晚于该日期的研报，YYYY-MM-DD"),
    limit: z.number().min(1).max(20).default(8),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    items: z.array(
      z.object({
        reportId: z.number(),
        title: z.string(),
        institution: z.string().nullable(),
        publishDate: z.string(),
        pdfUrl: z.string().nullable(),
        pageFrom: z.number().nullable(),
        pageTo: z.number().nullable(),
        excerpt: z.string().nullable(),
      }),
    ),
  }),
  execute: async ({ symbol, query, asOf, limit }) => {
    if (query?.trim()) {
      try {
        const embedded = await quant.embedResearchTexts([query.trim()]);
        const vector = JSON.stringify(embedded.vectors[0]);
        const asOfFilter = asOf ? sql`AND rr.publish_date <= ${asOf}::date` : sql``;
        const result = await db.execute(sql`
          SELECT rr.id AS report_id, rr.title, rr.institution, rr.publish_date, rr.pdf_url,
                 c.page_from, c.page_to, c.chunk_text
          FROM research_report_chunk c
          JOIN research_report rr ON rr.id = c.report_id
          WHERE rr.symbol = ${symbol.trim().toUpperCase()}
            AND c.embedding IS NOT NULL
            ${asOfFilter}
          ORDER BY c.embedding <=> ${vector}::vector
          LIMIT ${limit}
        `);
        return {
          symbol,
          items: result.rows.map((row) => ({
            reportId: Number(row.report_id),
            title: String(row.title),
            institution: row.institution ? String(row.institution) : null,
            publishDate: String(row.publish_date),
            pdfUrl: row.pdf_url ? String(row.pdf_url) : null,
            pageFrom: Number(row.page_from),
            pageTo: Number(row.page_to),
            excerpt: String(row.chunk_text).slice(0, 500),
          })),
        };
      } catch {
        // Vector retrieval falls through to keyword matching when embeddings are unavailable.
      }
    }
    const conditions = [eq(researchReport.symbol, symbol.trim().toUpperCase())];
    if (asOf) conditions.push(lte(researchReport.publishDate, asOf));
    if (query?.trim()) {
      conditions.push(
        or(
          ilike(researchReport.title, `%${query.trim()}%`),
          ilike(researchReportChunk.chunkText, `%${query.trim()}%`),
        )!,
      );
    }
    const rows = await db
      .select({
        reportId: researchReport.id,
        title: researchReport.title,
        institution: researchReport.institution,
        publishDate: researchReport.publishDate,
        pdfUrl: researchReport.pdfUrl,
        pageFrom: researchReportChunk.pageFrom,
        pageTo: researchReportChunk.pageTo,
        excerpt: researchReportChunk.chunkText,
      })
      .from(researchReport)
      .leftJoin(researchReportChunk, eq(researchReportChunk.reportId, researchReport.id))
      .where(and(...conditions))
      .orderBy(desc(researchReport.publishDate), researchReportChunk.chunkIndex)
      .limit(limit);
    return {
      symbol,
      items: rows.map((row) => ({
        ...row,
        excerpt: row.excerpt ? row.excerpt.slice(0, 500) : null,
      })),
    };
  },
});
