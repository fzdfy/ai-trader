import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";

const databaseUrl =
  process.env.WORKFLOW_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://ai-trader:aitrader123@localhost:5432/aitrader";
const runDatabaseTests = process.env.WORKFLOW_DB_TESTS === "1";

test(
  "workflow schema keeps versions, runs, and ownership consistent",
  { skip: runDatabaseTests ? false : "set WORKFLOW_DB_TESTS=1 to run" },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    const suffix = crypto.randomUUID();
    const ownerId = `workflow-test-owner-${suffix}`;
    const otherId = `workflow-test-other-${suffix}`;
    const graph = JSON.stringify({ schemaVersion: 1, nodes: [], edges: [] });
    let workflowId = 0;
    let versionId = 0;
    let runId = 0;

    const expectRejected = async (expectedCode: string, statement: string, values: unknown[]) => {
      await client.query("SAVEPOINT expected_failure");
      let rejection: { code?: string } | undefined;
      try {
        await client.query(statement, values);
      } catch (error) {
        rejection = error as { code?: string };
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT expected_failure");
        await client.query("RELEASE SAVEPOINT expected_failure");
      }
      assert.equal(rejection?.code, expectedCode);
    };

    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, 'Workflow owner', $2, true, now(), now()),
                ($3, 'Other user', $4, true, now(), now())`,
        [ownerId, `${ownerId}@test.local`, otherId, `${otherId}@test.local`],
      );

      const definition = await client.query<{ id: number }>(
        `INSERT INTO workflow_definition (user_id, name, draft_graph)
         VALUES ($1, 'Schema test', $2::jsonb)
         RETURNING id`,
        [ownerId, graph],
      );
      workflowId = Number(definition.rows[0]!.id);

      const version = await client.query<{ id: number }>(
        `INSERT INTO workflow_version
           (workflow_id, version, graph_json, trigger_type, trigger_config)
         VALUES ($1, 1, $2::jsonb, 'manual', '{"type":"manual"}'::jsonb)
         RETURNING id`,
        [workflowId, graph],
      );
      versionId = Number(version.rows[0]!.id);

      await expectRejected(
        "23503",
        `UPDATE workflow_definition SET current_version = 99 WHERE id = $1`,
        [workflowId],
      );
      await client.query(`UPDATE workflow_definition SET current_version = 1 WHERE id = $1`, [
        workflowId,
      ]);

      const run = await client.query<{ id: number }>(
        `INSERT INTO workflow_run
           (workflow_id, version_id, user_id, status, trigger_type)
         VALUES ($1, $2, $3, 'success', 'manual')
         RETURNING id`,
        [workflowId, versionId, ownerId],
      );
      runId = Number(run.rows[0]!.id);

      await client.query(
        `INSERT INTO workflow_node_run
           (workflow_run_id, node_id, node_type, status)
         VALUES ($1, 'screen-1', 'screen', 'success')`,
        [runId],
      );

      const ownerRuns = await client.query(`SELECT id FROM workflow_run WHERE user_id = $1`, [
        ownerId,
      ]);
      assert.equal(ownerRuns.rowCount, 1);
      const otherRuns = await client.query(`SELECT id FROM workflow_run WHERE user_id = $1`, [
        otherId,
      ]);
      assert.equal(otherRuns.rowCount, 0);

      await client.query(`UPDATE workflow_definition SET archived_at = now() WHERE id = $1`, [
        workflowId,
      ]);
      const retained = await client.query(`SELECT id FROM workflow_run WHERE id = $1`, [runId]);
      assert.equal(retained.rowCount, 1);

      await client.query(`DELETE FROM workflow_run WHERE id = $1`, [runId]);
      const nodes = await client.query(
        `SELECT id FROM workflow_node_run WHERE workflow_run_id = $1`,
        [runId],
      );
      assert.equal(nodes.rowCount, 0);

      const otherDefinition = await client.query<{ id: number }>(
        `INSERT INTO workflow_definition (user_id, name, draft_graph)
         VALUES ($1, 'Other workflow', $2::jsonb)
         RETURNING id`,
        [otherId, graph],
      );
      const otherWorkflowId = Number(otherDefinition.rows[0]!.id);
      const otherVersion = await client.query<{ id: number }>(
        `INSERT INTO workflow_version
           (workflow_id, version, graph_json, trigger_type, trigger_config)
         VALUES ($1, 1, $2::jsonb, 'manual', '{"type":"manual"}'::jsonb)
         RETURNING id`,
        [otherWorkflowId, graph],
      );

      await expectRejected(
        "23503",
        `INSERT INTO workflow_run
           (workflow_id, version_id, user_id, status, trigger_type)
         VALUES ($1, $2, $3, 'pending', 'manual')`,
        [workflowId, Number(otherVersion.rows[0]!.id), ownerId],
      );
      await expectRejected(
        "23502",
        `INSERT INTO workflow_run
           (workflow_id, version_id, user_id, status, trigger_type)
         VALUES ($1, NULL, $2, 'pending', 'manual')`,
        [workflowId, ownerId],
      );
      await expectRejected(
        "23503",
        `INSERT INTO workflow_run
           (workflow_id, version_id, user_id, status, trigger_type)
         VALUES ($1, $2, $3, 'pending', 'manual')`,
        [workflowId, versionId, otherId],
      );

      await client.query(
        `INSERT INTO workflow_run
           (workflow_id, version_id, user_id, status, trigger_type)
         VALUES ($1, $2, $3, 'pending', 'manual')`,
        [workflowId, versionId, ownerId],
      );
      await expectRejected(
        "23505",
        `INSERT INTO workflow_run
           (workflow_id, version_id, user_id, status, trigger_type)
         VALUES ($1, $2, $3, 'running', 'manual')`,
        [workflowId, versionId, ownerId],
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);
