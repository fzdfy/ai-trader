import { StockSDK } from "stock-sdk";
import { db } from "../src/db";
import { board } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function syncBoards() {
  const sdk = new StockSDK();

  // 获取行业板块
  console.log("[sync] fetching industry boards...");
  const industries = await sdk.board.industry.list();
  console.log(`[sync] got ${industries.length} industry boards`);

  // 获取概念板块
  console.log("[sync] fetching concept boards...");
  const concepts = await sdk.board.concept.list();
  console.log(`[sync] got ${concepts.length} concept boards`);

  // 行业板块入库
  for (const item of industries) {
    await db
      .insert(board)
      .values({
        code: item.code,
        type: "industry",
        name: item.name,
        rank: String(item.rank),
        changePercent: item.changePercent != null ? String(item.changePercent) : null,
        popularity: item.turnoverRate != null ? String(item.turnoverRate) : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: board.code,
        set: {
          type: "industry",
          name: item.name,
          rank: String(item.rank),
          changePercent: item.changePercent != null ? String(item.changePercent) : null,
          popularity: item.turnoverRate != null ? String(item.turnoverRate) : null,
          updatedAt: new Date(),
        },
      });
  }
  console.log("[sync] upserted industry boards");

  // 概念板块入库
  for (const item of concepts) {
    await db
      .insert(board)
      .values({
        code: item.code,
        type: "concept",
        name: item.name,
        rank: String(item.rank),
        changePercent: item.changePercent != null ? String(item.changePercent) : null,
        popularity: item.turnoverRate != null ? String(item.turnoverRate) : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: board.code,
        set: {
          type: "concept",
          name: item.name,
          rank: String(item.rank),
          changePercent: item.changePercent != null ? String(item.changePercent) : null,
          popularity: item.turnoverRate != null ? String(item.turnoverRate) : null,
          updatedAt: new Date(),
        },
      });
  }
  console.log("[sync] upserted concept boards");

  console.log(`[sync] done. industry: ${industries.length}, concept: ${concepts.length}`);
  process.exit(0);
}

syncBoards().catch((err) => {
  console.error("[sync] error:", err);
  process.exit(1);
});
