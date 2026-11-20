import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  RESEARCH_AGENT_EVIDENCE_LIMIT,
  searchResearchEvidence,
} from "../../../services/research-evidence-service";

export const researchReportTool = createTool({
  id: "searchResearchReports",
  description:
    "按标的、发布日期和主题检索已入库研报，返回标题、机构、发布日期、页码、原文片段和来源。回答必须保留这些引用；证据不足时明确说明，不得补写或虚构研报观点。",
  inputSchema: z.object({
    symbol: z.string().describe("A 股代码，如 002594.SZ"),
    query: z.string().optional().describe("主题关键词，如海外、盈利、估值、风险"),
    asOf: z.string().optional().describe("只使用不晚于该日期的研报，YYYY-MM-DD"),
    limit: z
      .number()
      .min(1)
      .max(RESEARCH_AGENT_EVIDENCE_LIMIT)
      .default(RESEARCH_AGENT_EVIDENCE_LIMIT),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    mode: z.enum(["semantic", "keyword"]),
    model: z.string().nullable(),
    items: z.array(
      z.object({
        reportId: z.number(),
        sourceId: z.string(),
        title: z.string(),
        institution: z.string().nullable(),
        publishDate: z.string(),
        pdfUrl: z.string().nullable(),
        pageFrom: z.number().nullable(),
        pageTo: z.number().nullable(),
        sectionTitle: z.string().nullable(),
        excerpt: z.string().nullable(),
        similarity: z.number().nullable(),
      }),
    ),
  }),
  execute: async ({ symbol, query, asOf, limit }) => {
    const result = await searchResearchEvidence({
      symbol,
      query,
      asOf,
      limit,
    });
    return {
      symbol: symbol.trim().toUpperCase(),
      ...result,
      items: result.items.map((item) => ({
        ...item,
        excerpt: item.excerpt?.slice(0, 500) ?? null,
      })),
    };
  },
});
