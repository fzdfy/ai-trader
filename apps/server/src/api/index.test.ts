import assert from "node:assert/strict";
import test, { after } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../db";
import {
  newsArticle,
  newsArticleSymbol,
  researchReport,
  researchReportDocument,
} from "../db/schema";
import { quant } from "../lib/quant";
import { createDataManagementRoute } from "./data-management.ts";
import { api } from "./index.ts";

after(async () => {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});

test("mounts the latest quote route used by stock analysis", async () => {
  const response = await api.request("/quotes/latest");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: [] });
});

test("protects the data-management API with a server session", async () => {
  const response = await api.request("/data-management/tables");
  assert.equal(response.status, 401);
});

test("removes legacy admin API paths", async () => {
  assert.equal((await api.request("/sync/status")).status, 404);
  assert.equal((await api.request("/data-center/tables")).status, 404);
});

test("data-management route rejects users and allows super administrators", async () => {
  const userRoute = createDataManagementRoute(async () => ({
    id: "u1",
    name: "User",
    email: "user@example.com",
    role: "user",
  }));
  const adminRoute = createDataManagementRoute(async () => ({
    id: "u2",
    name: "Admin",
    email: "admin@example.com",
    role: "super_admin",
  }));

  assert.equal((await userRoute.request("/")).status, 403);
  assert.equal((await adminRoute.request("/")).status, 200);
});

test("normal users cannot trigger audited data-management writes", async () => {
  const userRoute = createDataManagementRoute(async () => ({
    id: "u1",
    name: "User",
    email: "user@example.com",
    role: "user",
  }));

  const response = await userRoute.request("/sync/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "attempt" }),
  });

  assert.equal(response.status, 403);
});

test("module retry requires an explicit reason", async () => {
  const adminRoute = createDataManagementRoute(async () => ({
    id: "u2",
    name: "Admin",
    email: "admin@example.com",
    role: "super_admin",
  }));

  const response = await adminRoute.request("/sync/modules/boards/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
});

test("stock analysis refresh returns module results when one content source fails", async (t) => {
  const originalSession = auth.api.getSession;
  const originalNews = quant.stockNews;
  const originalAnnouncements = quant.announcements;
  const originalReports = quant.researchReports;
  const source = `test-refresh-${crypto.randomUUID()}`;
  const url = `https://example.com/${crypto.randomUUID()}`;
  t.after(async () => {
    auth.api.getSession = originalSession;
    quant.stockNews = originalNews;
    quant.announcements = originalAnnouncements;
    quant.researchReports = originalReports;
    const articles = await db
      .select({ id: newsArticle.id })
      .from(newsArticle)
      .where(eq(newsArticle.source, source));
    const ids = articles.map((article) => article.id);
    if (ids.length > 0) {
      await db.delete(newsArticleSymbol).where(inArray(newsArticleSymbol.articleId, ids));
      await db.delete(newsArticle).where(inArray(newsArticle.id, ids));
    }
  });
  auth.api.getSession = (async () => ({
    user: { id: "refresh-test-user" },
    session: { id: "refresh-test-session" },
  })) as typeof originalSession;
  quant.stockNews = async () => [
    {
      source,
      title: "刷新新闻",
      content: null,
      url,
      published_at: null,
      related_symbols: [],
    },
  ];
  quant.announcements = async () => {
    throw new Error("公告源超时");
  };
  quant.researchReports = async () => ({
    symbol: "002594.SZ",
    page: 1,
    page_size: 100,
    total: 0,
    items: [],
  });

  const response = await api.request("/stock-analysis/002594.SZ/refresh", {
    method: "POST",
  });
  const body = (await response.json()) as {
    data: {
      symbol: string;
      modules: Record<string, { ok: boolean; inserted: number; error: string | null }>;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.data.symbol, "002594.SZ");
  assert.equal(body.data.modules.news?.ok, true);
  assert.equal(body.data.modules.news?.inserted, 1);
  assert.equal(body.data.modules.announcements?.ok, false);
  assert.match(body.data.modules.announcements?.error ?? "", /公告源超时/);
  assert.equal(body.data.modules.reports?.ok, true);
});

test("stock analysis returns the aggregate pending PDF count", async () => {
  const [expected] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${researchReportDocument.extractStatus} is distinct from 'extracted')::int`,
    })
    .from(researchReport)
    .leftJoin(
      researchReportDocument,
      eq(researchReportDocument.reportId, researchReport.id),
    )
    .where(eq(researchReport.symbol, "002594.SZ"));

  const response = await api.request("/stock-analysis/002594.SZ");
  const body = (await response.json()) as {
    data: { reportPdfPending: number };
  };

  assert.equal(response.status, 200);
  assert.equal(body.data.reportPdfPending, Number(expected?.pending ?? 0));
});
