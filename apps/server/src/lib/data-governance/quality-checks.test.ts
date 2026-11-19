import assert from "node:assert/strict";
import test, { after } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  newsArticle,
  researchReport,
  researchReportDocument,
} from "../../db/schema";
import { executeQualityRule } from "./quality-checks.ts";
import { QUALITY_RULES } from "./quality-rules.ts";
import { getGovernanceAsset } from "./registry.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

after(async () => {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});

test(
  "all executable quality checks run without SQL errors",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const now = new Date();
    for (const assetKey of ["bar1d_raw", "bar1d_hfq", "adj_factor"]) {
      const asset = getGovernanceAsset(assetKey);
      assert.ok(asset);
      for (const rule of QUALITY_RULES.filter(
        (candidate) => candidate.assetKey === assetKey,
      )) {
        const result = await executeQualityRule(rule, {
          asset,
          now,
          jobRunId: null,
          requestId: "quality-check-test",
        });
        assert.notEqual(
          result.status,
          "error",
          `${rule.id}: ${JSON.stringify(result.details)}`,
        );
      }
    }
  },
);

test(
  "content checks report unlinked news and pending research documents",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const newsSource = `quality-news-${suffix}`;
    const reportSource = `quality-report-${suffix}`;
    const reportSourceId = suffix;
    const now = new Date();
    let reportId: number | null = null;
    try {
      await db.insert(newsArticle).values({
        source: newsSource,
        title: "未关联新闻",
        url: `https://example.com/${suffix}`,
        publishedAt: now,
      });
      const [report] = await db
        .insert(researchReport)
        .values({
          source: reportSource,
          sourceId: reportSourceId,
          symbol: "002594.SZ",
          title: "待提取 PDF 研报",
          analysts: [],
          publishDate: now.toISOString().slice(0, 10),
          rawJson: {},
        })
        .returning({ id: researchReport.id });
      reportId = report!.id;
      await db.insert(researchReportDocument).values({
        reportId,
        extractStatus: "pending",
        storageKey: null,
      });

      const linkRule = QUALITY_RULES.find(
        (rule) => rule.checkKey === "coverage.symbol_links",
      )!;
      const documentRule = QUALITY_RULES.find(
        (rule) => rule.checkKey === "validity.research_documents",
      )!;
      const linkResult = await executeQualityRule(linkRule, {
        asset: getGovernanceAsset("news_article_symbol")!,
        now,
        jobRunId: null,
        requestId: "quality-link-test",
      });
      const documentResult = await executeQualityRule(documentRule, {
        asset: getGovernanceAsset("research_report_document")!,
        now,
        jobRunId: null,
        requestId: "quality-document-test",
      });

      assert.equal(linkResult.status, "warning");
      assert.ok(Number(linkResult.details.unlinkedArticles) >= 1);
      assert.equal(documentResult.status, "warning");
      assert.ok(Number(documentResult.details.incompleteDocuments) >= 1);
    } finally {
      await db.delete(newsArticle).where(eq(newsArticle.source, newsSource));
      if (reportId != null) {
        await db
          .delete(researchReportDocument)
          .where(eq(researchReportDocument.reportId, reportId));
        await db
          .delete(researchReport)
          .where(
            inArray(researchReport.sourceId, [reportSourceId]),
          );
      }
    }
  },
);
