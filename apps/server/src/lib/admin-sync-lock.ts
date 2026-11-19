import { sql } from "drizzle-orm";
import { db } from "../db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withAdminSyncLock<T>(
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1470321)`);
    return work(tx);
  });
}
