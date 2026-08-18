import { db } from "../db";
import { user } from "../db/schema";
import { inArray } from "drizzle-orm";

/** 内置/系统创建者的显示名 */
const SYSTEM_CREATOR = "系统";

/**
 * 将一组创建者 ID 解析为显示名。
 * - "system" → "系统"
 * - 其余 ID 查 user 表，取 name（缺省回退 email，再回退原始 ID）
 */
export async function resolveCreatorNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map: Record<string, string> = { system: SYSTEM_CREATOR };

  const userIds = unique.filter((id) => id !== "system");
  if (userIds.length === 0) return map;

  const users = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(inArray(user.id, userIds));

  for (const u of users) {
    map[u.id] = u.name || u.email;
  }

  // 未匹配到的用户 ID 兜底显示原始 ID
  for (const id of userIds) {
    if (!map[id]) map[id] = id;
  }

  return map;
}
