import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";

const databaseUrl =
  process.env.ADMIN_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://ai-trader:aitrader123@localhost:5432/aitrader";
const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test(
  "admin schema defaults users and constrains roles and audit records",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const suffix = crypto.randomUUID();
    const userId = `admin-role-${suffix}`;
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, 'Role test', $2, true, now(), now())`,
        [userId, `${userId}@test.local`],
      );
      const role = await client.query<{ role: string }>(
        `SELECT role FROM "user" WHERE id = $1`,
        [userId],
      );
      assert.equal(role.rows[0]?.role, "user");

      await client.query("SAVEPOINT invalid_role");
      let invalidRoleCode: string | undefined;
      try {
        await client.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [userId]);
      } catch (error) {
        invalidRoleCode = (error as { code?: string }).code;
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT invalid_role");
        await client.query("RELEASE SAVEPOINT invalid_role");
      }
      assert.equal(invalidRoleCode, "23514");

      const audit = await client.query<{ id: number }>(
        `INSERT INTO admin_operation_audit
           (actor_user_id, action, target_job_type, reason, request_id, status, input_json)
         VALUES ($1, 'sync_retry', 'boards', '恢复失败任务', $2, 'accepted', '{}'::jsonb)
         RETURNING id`,
        [userId, `req-${suffix}`],
      );
      assert.ok((audit.rows[0]?.id ?? 0) > 0);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);
