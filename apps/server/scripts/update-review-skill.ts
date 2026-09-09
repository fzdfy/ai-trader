/**
 * 一次性脚本：把 review_skill 表 name="default" 的复盘方法论（instructions）更新为最新版。
 *
 * 背景：数据库里已存在旧版（4 条简化版）复盘方法论记录，ensureInstructions() 优先返回
 * 数据库内容，导致代码里升级后的 DEFAULT_INSTRUCTIONS（含数据源映射、模块结构、
 * 主线口径、市场情绪口径、输出要求）不生效。本脚本幂等地把该记录覆盖为最新方法论。
 *
 * 用法（在仓库根目录）：
 *   node --import @oxc-node/core/register --env-file=.env.local apps/server/scripts/update-review-skill.ts
 */
import { db } from "../src/db";
import { reviewSkill } from "../src/db/schema";
import { DEFAULT_INSTRUCTIONS } from "../src/api/reviews";

await db
  .insert(reviewSkill)
  .values({
    name: "default",
    content: { instructions: DEFAULT_INSTRUCTIONS },
    updatedAt: new Date(),
  })
  .onConflictDoUpdate({
    target: reviewSkill.name,
    set: {
      content: { instructions: DEFAULT_INSTRUCTIONS },
      updatedAt: new Date(),
    },
  });

console.log("[update-review-skill] 已把 review_skill.default 更新为最新复盘方法论。");

await db.$client.end();
