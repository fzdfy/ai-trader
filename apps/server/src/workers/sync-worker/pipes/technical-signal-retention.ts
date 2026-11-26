import { lt } from "drizzle-orm";

import { db } from "../../../db";
import { technicalSignalSnapshot, technicalSignalTrigger } from "../../../db/schema";

const DAY_MS = 86_400_000;

export const technicalSignalRetentionCutoff = (now: Date): string =>
  new Date(now.getTime() - 180 * DAY_MS).toISOString().slice(0, 10);

export async function runTechnicalSignalRetention(
  dependencies: {
    now?: () => Date;
    deleteSnapshots?: (cutoff: string) => Promise<number>;
    deleteTriggers?: (cutoff: string) => Promise<number>;
  } = {},
) {
  const cutoff = technicalSignalRetentionCutoff(dependencies.now?.() ?? new Date());
  const deleteSnapshots =
    dependencies.deleteSnapshots ??
    (async (value: string) => {
      const result = await db
        .delete(technicalSignalSnapshot)
        .where(lt(technicalSignalSnapshot.asOf, value));
      return result.rowCount ?? 0;
    });
  const deleteTriggers =
    dependencies.deleteTriggers ??
    (async (value: string) => {
      const result = await db
        .delete(technicalSignalTrigger)
        .where(lt(technicalSignalTrigger.asOf, value));
      return result.rowCount ?? 0;
    });

  const snapshots = await deleteSnapshots(cutoff);
  const triggers = await deleteTriggers(cutoff);
  return { cutoff, snapshots, triggers };
}
