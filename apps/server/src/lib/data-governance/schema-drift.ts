import { sql } from "drizzle-orm";
import { db } from "../../db";
import { GOVERNANCE_ASSETS } from "./registry";

export function diffGovernanceAssets(
  registeredKeys: readonly string[],
  actualKeys: readonly string[],
): { missing: string[]; extra: string[] } {
  const registered = new Set(registeredKeys);
  const actual = new Set(
    actualKeys.filter(
      (key) => !/_\d{4}$/.test(key) && !key.endsWith("_default"),
    ),
  );
  return {
    missing: [...actual].filter((key) => !registered.has(key)).sort(),
    extra: [...registered].filter((key) => !actual.has(key)).sort(),
  };
}

export async function checkGovernanceSchema(): Promise<{
  missing: string[];
  extra: string[];
}> {
  const response = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type IN ('BASE TABLE', 'VIEW')
      AND table_name NOT LIKE '\\_%' ESCAPE '\\'
  `);
  return diffGovernanceAssets(
    GOVERNANCE_ASSETS.map((asset) => asset.key),
    response.rows.map((row) => String((row as { table_name: string }).table_name)),
  );
}
