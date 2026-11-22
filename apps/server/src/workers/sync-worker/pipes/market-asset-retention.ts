import dayjs from "dayjs";
import { lt } from "drizzle-orm";
import { db } from "../../../db";
import { marketAssetMinuteBar } from "../../../db/schema";

export interface MarketAssetRetentionDependencies {
  now: () => Date;
  deleteBefore: (cutoff: Date) => Promise<number>;
}

export function retentionCutoff(now: Date): Date {
  return dayjs(now).subtract(13, "month").toDate();
}

async function deleteBefore(cutoff: Date): Promise<number> {
  const result = await db
    .delete(marketAssetMinuteBar)
    .where(lt(marketAssetMinuteBar.bucketStart, cutoff));
  return result.rowCount ?? 0;
}

export async function runMarketAssetRetention(
  deps: MarketAssetRetentionDependencies = {
    now: () => new Date(),
    deleteBefore,
  },
): Promise<{ cutoff: Date; deleted: number }> {
  const cutoff = retentionCutoff(deps.now());
  return { cutoff, deleted: await deps.deleteBefore(cutoff) };
}

export async function marketAssetRetentionRun(): Promise<void> {
  const result = await runMarketAssetRetention();
  console.log(
    `[market-asset-retention] cutoff=${result.cutoff.toISOString()} deleted=${result.deleted}`,
  );
}
