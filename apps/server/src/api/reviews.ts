import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { reviewDaily, reviewSkill } from "../db/schema";
import { badRequest, ok, serverError } from "../lib/response";
import { getMainlineData } from "../agent/mastra/tools/review-tools.ts";
import {
  DEFAULT_INSTRUCTIONS,
  ensureReviewInstructions,
  generateReview,
  generateReviewStreaming,
  resolveReviewDate,
} from "../services/review-service.ts";

export { DEFAULT_INSTRUCTIONS };

const reviewsRoute = new Hono();

reviewsRoute.get("/skill", async (c) => {
  return ok(c, {
    content: { instructions: await ensureReviewInstructions() },
  });
});

reviewsRoute.put("/skill", async (c) => {
  const body = (await c.req.json()) as {
    content?: { instructions?: unknown };
  };
  const instructions = body.content?.instructions;
  if (typeof instructions !== "string" || !instructions.trim()) {
    return badRequest(c, "content.instructions is required");
  }
  const content = { instructions };
  await db
    .insert(reviewSkill)
    .values({ name: "default", content, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: reviewSkill.name,
      set: { content, updatedAt: new Date() },
    });
  return ok(c, { content });
});

reviewsRoute.post("/generate", async (c) => {
  const body = (await c.req.json()) as { date?: string };
  try {
    return ok(c, await generateReview(body.date));
  } catch (error) {
    console.error("[reviews] generate error:", error);
    return serverError(c, "复盘生成失败，请稍后重试。");
  }
});

reviewsRoute.post("/generate/stream", async (c) => {
  const body = (await c.req.json()) as { date?: string };
  const date = await resolveReviewDate(body.date);

  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({ event: "meta", data: JSON.stringify({ date }) });
      await generateReviewStreaming(date, async (section, index) => {
        await stream.writeSSE({
          event: "section",
          data: JSON.stringify({ index, ...section }),
        });
      });
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ date }),
      });
    } catch (error) {
      console.error("[reviews] stream error:", error);
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: "复盘生成失败，请稍后重试。" }),
      });
    }
  });
});

reviewsRoute.get("/mainline", async (c) => {
  const date = c.req.query("date")?.trim() || undefined;
  const limitParam = c.req.query("limit");
  const parsedLimit = limitParam ? Math.floor(Number(limitParam)) : 5;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 10) : 5;

  try {
    return ok(c, await getMainlineData(date, limit));
  } catch (error) {
    console.error("[reviews] mainline error:", error);
    return serverError(c, "主线获取失败，请稍后重试。");
  }
});

reviewsRoute.get("/list", async (c) => {
  const rows = await db
    .select({
      date: reviewDaily.date,
      summary: reviewDaily.summary,
      updatedAt: reviewDaily.updatedAt,
    })
    .from(reviewDaily)
    .orderBy(desc(reviewDaily.date));
  return ok(c, rows);
});

reviewsRoute.get("/current-date", async (c) => {
  return ok(c, { date: await resolveReviewDate() });
});

reviewsRoute.get("/:date", async (c) => {
  const [row] = await db
    .select()
    .from(reviewDaily)
    .where(eq(reviewDaily.date, c.req.param("date")));
  if (!row) return ok(c, null);
  return ok(c, {
    date: row.date,
    sections: row.sections,
    summary: row.summary,
    skill: row.skill,
    updatedAt: row.updatedAt,
  });
});

export { reviewsRoute };
