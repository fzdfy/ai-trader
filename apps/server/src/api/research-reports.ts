import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { and, count, desc, eq, ilike, lte, or, sql } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../db";
import { researchReport, researchReportChunk, researchReportDocument } from "../db/schema";
import { resolveReportStoragePath } from "../lib/research-report-storage";
import { quant } from "../lib/quant";
import { badRequest, notFound, ok, serverError } from "../lib/response";

const researchReportsRoute = new Hono();
const REPORTS_DATA_DIR = process.env.REPORTS_DATA_DIR ?? "/data/reports";

researchReportsRoute.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ success: false, error: "Unauthorized" }, 401);
  await next();
});

researchReportsRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol")?.trim().toUpperCase();
  const query = c.req.query("q")?.trim();
  const page = Math.max(Number(c.req.query("page") ?? "1"), 1);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "20"), 1), 100);
  const conditions = [];
  if (symbol) conditions.push(eq(researchReport.symbol, symbol));
  if (query) {
    conditions.push(
      or(
        ilike(researchReport.title, `%${query}%`),
        ilike(researchReport.institution, `%${query}%`),
        ilike(researchReportDocument.fullText, `%${query}%`),
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  try {
    const base = db
      .select({
        id: researchReport.id,
        source: researchReport.source,
        symbol: researchReport.symbol,
        title: researchReport.title,
        institution: researchReport.institution,
        rating: researchReport.rating,
        publishDate: researchReport.publishDate,
        pdfUrl: researchReport.pdfUrl,
        extractStatus: researchReportDocument.extractStatus,
        pageCount: researchReportDocument.pageCount,
        storageKey: researchReportDocument.storageKey,
      })
      .from(researchReport)
      .leftJoin(researchReportDocument, eq(researchReportDocument.reportId, researchReport.id))
      .$dynamic();
    const countBase = db
      .select({ total: count() })
      .from(researchReport)
      .leftJoin(researchReportDocument, eq(researchReportDocument.reportId, researchReport.id))
      .$dynamic();
    if (where) {
      base.where(where);
      countBase.where(where);
    }
    const [items, totalRows] = await Promise.all([
      base
        .orderBy(desc(researchReport.publishDate))
        .limit(limit)
        .offset((page - 1) * limit),
      countBase,
    ]);
    return ok(c, {
      items,
      total: totalRows[0]?.total ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error("[research-reports] list failed:", error);
    return serverError(c, "研报列表读取失败");
  }
});

researchReportsRoute.post("/search", async (c) => {
  const body = (await c.req.json()) as {
    symbol?: string;
    query?: string;
    asOf?: string;
    limit?: number;
  };
  const symbol = body.symbol?.trim().toUpperCase();
  const query = body.query?.trim();
  if (!symbol || !query) return badRequest(c, "symbol and query are required");
  const limit = Math.min(Math.max(body.limit ?? 8, 1), 20);

  try {
    const embedded = await quant.embedResearchTexts([query]);
    const vector = JSON.stringify(embedded.vectors[0]);
    const asOfFilter = body.asOf ? sql`AND rr.publish_date <= ${body.asOf}::date` : sql``;
    const result = await db.execute(sql`
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
        1 - (c.embedding <=> ${vector}::vector) AS similarity
      FROM research_report_chunk c
      JOIN research_report rr ON rr.id = c.report_id
      WHERE rr.symbol = ${symbol}
        AND c.embedding IS NOT NULL
        ${asOfFilter}
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${limit}
    `);
    return ok(c, {
      mode: "semantic",
      model: embedded.model,
      items: result.rows.map((row) => ({
        reportId: Number(row.report_id),
        title: String(row.title),
        institution: row.institution ? String(row.institution) : null,
        publishDate: String(row.publish_date),
        pdfUrl: row.pdf_url ? String(row.pdf_url) : null,
        pageFrom: Number(row.page_from),
        pageTo: Number(row.page_to),
        sectionTitle: row.section_title ? String(row.section_title) : null,
        excerpt: String(row.chunk_text).slice(0, 800),
        similarity: Number(row.similarity),
      })),
    });
  } catch (error) {
    console.error("[research-reports] semantic search failed, using keyword fallback:", error);
    const conditions = [
      eq(researchReport.symbol, symbol),
      or(
        ilike(researchReport.title, `%${query}%`),
        ilike(researchReportChunk.chunkText, `%${query}%`),
      )!,
    ];
    if (body.asOf) conditions.push(lte(researchReport.publishDate, body.asOf));
    const rows = await db
      .select({
        reportId: researchReport.id,
        title: researchReport.title,
        institution: researchReport.institution,
        publishDate: researchReport.publishDate,
        pdfUrl: researchReport.pdfUrl,
        pageFrom: researchReportChunk.pageFrom,
        pageTo: researchReportChunk.pageTo,
        sectionTitle: researchReportChunk.sectionTitle,
        excerpt: researchReportChunk.chunkText,
      })
      .from(researchReport)
      .leftJoin(researchReportChunk, eq(researchReportChunk.reportId, researchReport.id))
      .where(and(...conditions))
      .orderBy(desc(researchReport.publishDate), researchReportChunk.chunkIndex)
      .limit(limit);
    return ok(c, {
      mode: "keyword",
      model: null,
      items: rows.map((row) => ({
        ...row,
        pageFrom: row.pageFrom,
        pageTo: row.pageTo,
        excerpt: row.excerpt?.slice(0, 800) ?? null,
        similarity: null,
      })),
    });
  }
});

researchReportsRoute.get("/:id/pdf", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ success: false, error: "Unauthorized" }, 401);
  const reportId = Number(c.req.param("id"));
  if (!Number.isInteger(reportId) || reportId <= 0) return badRequest(c, "Invalid report id");

  try {
    const [document] = await db
      .select({
        storageKey: researchReportDocument.storageKey,
        contentType: researchReportDocument.contentType,
      })
      .from(researchReportDocument)
      .where(eq(researchReportDocument.reportId, reportId))
      .limit(1);
    if (!document?.storageKey) return notFound(c, "PDF document not available");
    const path = resolveReportStoragePath(REPORTS_DATA_DIR, document.storageKey);
    if (!path) return notFound(c, "PDF document not available");
    const file = await readFile(path);
    return c.body(new Uint8Array(file), 200, {
      "Content-Type": document.contentType ?? "application/pdf",
      "Content-Disposition": `inline; filename="report-${reportId}.pdf"`,
      "Cache-Control": "private, max-age=300",
    });
  } catch (error) {
    console.error("[research-reports] pdf failed:", error);
    return notFound(c, "PDF document not available");
  }
});

researchReportsRoute.get("/:id/evidence", async (c) => {
  const reportId = Number(c.req.param("id"));
  if (!Number.isInteger(reportId) || reportId <= 0) return badRequest(c, "Invalid report id");
  const query = c.req.query("q")?.trim();
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "8"), 1), 20);
  try {
    const base = db
      .select({
        id: researchReportChunk.id,
        pageFrom: researchReportChunk.pageFrom,
        pageTo: researchReportChunk.pageTo,
        sectionTitle: researchReportChunk.sectionTitle,
        chunkText: researchReportChunk.chunkText,
      })
      .from(researchReportChunk)
      .where(
        query
          ? and(
              eq(researchReportChunk.reportId, reportId),
              ilike(researchReportChunk.chunkText, `%${query}%`),
            )
          : eq(researchReportChunk.reportId, reportId),
      )
      .orderBy(researchReportChunk.chunkIndex)
      .limit(limit);
    return ok(c, await base);
  } catch (error) {
    console.error("[research-reports] evidence failed:", error);
    return serverError(c, "研报证据读取失败");
  }
});

researchReportsRoute.post("/:id/ingest", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ success: false, error: "Unauthorized" }, 401);
  const reportId = Number(c.req.param("id"));
  if (!Number.isInteger(reportId) || reportId <= 0) return badRequest(c, "Invalid report id");
  try {
    const [report] = await db
      .select()
      .from(researchReport)
      .where(eq(researchReport.id, reportId))
      .limit(1);
    if (!report) return notFound(c, "Research report not found");
    if (!report.pdfUrl) return badRequest(c, "Research report has no PDF source");
    const extracted = await quant.extractResearchReport({
      pdf_url: report.pdfUrl,
      source_id: report.sourceId,
      publish_date: report.publishDate,
      embed: true,
    });
    await db
      .insert(researchReportDocument)
      .values({
        reportId,
        storageKey: extracted.storage_key,
        sha256: extracted.sha256,
        fileSize: extracted.file_size,
        pageCount: extracted.page_count,
        contentType: "application/pdf",
        fullText: extracted.full_text,
        extractStatus: "extracted",
        extractorVersion: extracted.extractor_version,
        extractedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: researchReportDocument.reportId,
        set: {
          storageKey: extracted.storage_key,
          sha256: extracted.sha256,
          fileSize: extracted.file_size,
          pageCount: extracted.page_count,
          contentType: "application/pdf",
          fullText: extracted.full_text,
          extractStatus: "extracted",
          extractorVersion: extracted.extractor_version,
          extractedAt: new Date(),
          lastError: null,
        },
      });
    await db.delete(researchReportChunk).where(eq(researchReportChunk.reportId, reportId));
    if (extracted.chunks.length > 0) {
      await db.insert(researchReportChunk).values(
        extracted.chunks.map((chunk) => ({
          reportId,
          chunkIndex: chunk.chunk_index,
          pageFrom: chunk.page_from,
          pageTo: chunk.page_to,
          chunkText: chunk.text,
          embedding: chunk.embedding,
          embeddingModel: extracted.embedding_model,
          chunkVersion: "v1",
        })),
      );
    }
    return ok(c, {
      reportId,
      storageKey: extracted.storage_key,
      pageCount: extracted.page_count,
      chunkCount: extracted.chunks.length,
      embeddingModel: extracted.embedding_model,
    });
  } catch (error) {
    console.error("[research-reports] ingest failed:", error);
    return serverError(c, "研报入库失败，请稍后重试");
  }
});

researchReportsRoute.get("/:id", async (c) => {
  const reportId = Number(c.req.param("id"));
  if (!Number.isInteger(reportId) || reportId <= 0) return badRequest(c, "Invalid report id");
  try {
    const [row] = await db
      .select({
        id: researchReport.id,
        source: researchReport.source,
        symbol: researchReport.symbol,
        title: researchReport.title,
        institution: researchReport.institution,
        analysts: researchReport.analysts,
        rating: researchReport.rating,
        publishDate: researchReport.publishDate,
        pdfUrl: researchReport.pdfUrl,
        extractStatus: researchReportDocument.extractStatus,
        pageCount: researchReportDocument.pageCount,
        fullText: researchReportDocument.fullText,
      })
      .from(researchReport)
      .leftJoin(researchReportDocument, eq(researchReportDocument.reportId, researchReport.id))
      .where(eq(researchReport.id, reportId))
      .limit(1);
    if (!row) return notFound(c, "Research report not found");
    return ok(c, row);
  } catch (error) {
    console.error("[research-reports] detail failed:", error);
    return serverError(c, "研报详情读取失败");
  }
});

export { researchReportsRoute };
