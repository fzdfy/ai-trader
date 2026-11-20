import { sql, type SQL } from "drizzle-orm";

import { db } from "../db";
import { quant } from "../lib/quant";

export interface ResearchEvidenceItem {
  reportId: number;
  title: string;
  institution: string | null;
  publishDate: string;
  pdfUrl: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  sectionTitle: string | null;
  excerpt: string | null;
  similarity: number | null;
}

export interface ResearchEvidenceResult {
  mode: "semantic" | "keyword";
  model: string | null;
  items: ResearchEvidenceItem[];
}

interface SearchEvidenceInput {
  symbol: string;
  query?: string;
  asOf?: string;
  limit?: number;
}

interface EvidenceDependencies {
  embed?: typeof quant.embedResearchTexts;
  execute?: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }>;
}

function nullableString(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapRows(rows: Record<string, unknown>[], excerptLimit: number): ResearchEvidenceItem[] {
  return rows.map((row) => ({
    reportId: Number(row.report_id),
    title: String(row.title),
    institution: nullableString(row.institution),
    publishDate: String(row.publish_date),
    pdfUrl: nullableString(row.pdf_url),
    pageFrom: nullableNumber(row.page_from),
    pageTo: nullableNumber(row.page_to),
    sectionTitle: nullableString(row.section_title),
    excerpt: nullableString(row.chunk_text)?.slice(0, excerptLimit) ?? null,
    similarity: nullableNumber(row.similarity),
  }));
}

export async function searchResearchEvidence(
  input: SearchEvidenceInput,
  dependencies: EvidenceDependencies = {},
): Promise<ResearchEvidenceResult> {
  const embed = dependencies.embed ?? quant.embedResearchTexts;
  const execute = dependencies.execute ?? ((query) => db.execute(query));
  const symbol = input.symbol.trim().toUpperCase();
  const term = input.query?.trim();
  const asOfFilter = input.asOf ? sql`AND rr.publish_date <= ${input.asOf}::date` : sql``;
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 50);

  if (term) {
    try {
      const embedded = await embed([term]);
      const vector = embedded.vectors[0];
      if (vector) {
        const result = await execute(sql`
          SELECT
            rr.id AS report_id,
            rr.title,
            rr.institution,
            rr.publish_date,
            rr.pdf_url,
            c.page_from,
            c.page_to,
            c.section_title,
            c.chunk_text,
            1 - (c.embedding <=> ${JSON.stringify(vector)}::vector) AS similarity
          FROM research_report_chunk c
          JOIN research_report rr ON rr.id = c.report_id
          WHERE rr.symbol = ${symbol}
            AND c.embedding IS NOT NULL
            ${asOfFilter}
          ORDER BY c.embedding <=> ${JSON.stringify(vector)}::vector
          LIMIT ${limit}
        `);
        if (result.rows.length > 0) {
          return {
            mode: "semantic",
            model: embedded.model,
            items: mapRows(result.rows, 800),
          };
        }
      }
    } catch {
      // Empty or unavailable vector search always continues to keyword retrieval.
    }
  }

  const keywordFilter = term
    ? sql`AND (
        rr.title ILIKE ${`%${term}%`}
        OR c.chunk_text ILIKE ${`%${term}%`}
      )`
    : sql``;
  const result = await execute(sql`
    SELECT
      rr.id AS report_id,
      rr.title,
      rr.institution,
      rr.publish_date,
      rr.pdf_url,
      c.page_from,
      c.page_to,
      c.section_title,
      c.chunk_text,
      NULL::double precision AS similarity
    FROM research_report rr
    LEFT JOIN research_report_chunk c ON c.report_id = rr.id
    WHERE rr.symbol = ${symbol}
      ${asOfFilter}
      ${keywordFilter}
    ORDER BY rr.publish_date DESC, c.chunk_index ASC
    LIMIT ${limit}
  `);
  return {
    mode: "keyword",
    model: null,
    items: mapRows(result.rows, 800),
  };
}
