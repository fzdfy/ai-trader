# User Work Task Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a private personal Work Task module with inbox, plan dates, a three-column today board, persisted drag ordering, source snapshots, and controlled AI drafts.

**Architecture:** Keep governance review tasks and personal work tasks as separate domains. Rename the governance tables and symbols in place, add `user_work_task` tables and a thin Hono API over a transactional service, then replace the `/home/tasks` placeholder with TanStack Query hooks and a Preline/Tailwind page.

**Tech Stack:** React 19, TanStack Router/Query, Tailwind/Preline, Hono, Zod, Drizzle ORM, PostgreSQL, `@dnd-kit`.

**Spec:** `docs/superpowers/specs/2026-11-20-user-work-task-module-design.md`

## Global Constraints

- Personal data is private by owner; the user id always comes from the server session.
- Governance Review Task is not a user Work Task and remains super-admin only.
- Today uses the browser timezone and local `YYYY-MM-DD`, not a trading calendar.
- No hard delete, team sharing, reminders, recurring tasks, subtasks, or AI writes.
- UI uses existing Preline/Tailwind semantic tokens, supports keyboard, touch, reduced motion, light/dark, and desktop/mobile.
- Visual implementation follows `docs/design/prototypes/explorations/quant-workbench-user-work-task-v1.html`.
- The governance rename preserves every existing row, event, index, constraint, and foreign key.

## Review Focus

- Cross-user task ids must return 404 without exposing titles or source snapshots.
- Timezone/local-date boundaries must classify overdue and completed-today tasks consistently.
- A drag failure must roll back only the affected task and preserve other successful changes.
- Source snapshots must survive source mutation or deletion and must not cross user permissions.
- The migration must work on a non-empty governance dataset without dropping evidence.

---

### Task 1: Rename governance task domain

**Files:**
- Modify: `apps/server/src/db/schema/governance.ts`
- Move: `apps/server/src/lib/data-governance/work-tasks.ts` → `apps/server/src/lib/data-governance/review-tasks.ts`
- Move: `apps/server/src/lib/data-governance/work-tasks.test.ts` → `apps/server/src/lib/data-governance/review-tasks.test.ts`
- Modify: `apps/server/src/api/governance.ts`
- Modify: `apps/server/src/api/governance.test.ts`
- Modify: `apps/server/src/api/index.test.ts`
- Modify: `apps/server/src/workers/sync-worker/governance-jobs.ts`
- Modify: `apps/server/src/workers/sync-worker/governance-jobs.test.ts`
- Move: `apps/web/src/routes/home/data-management/governance/work-tasks.tsx` → `review-tasks.tsx`
- Modify: `apps/web/src/routes/home/data-management/governance/assets.tsx`
- Modify: `apps/web/src/hooks/useDataGovernance.ts`
- Modify: `apps/web/src/lib/workbench-navigation.ts`
- Test: `apps/server/src/api/governance.test.ts`

**Interfaces:**
- Produces: `governanceReviewTask`, `governanceReviewTaskEvent`, `CreateGovernanceReviewTaskInput`, `GovernanceReviewTaskTransition`, `createGovernanceReviewTask()`, `ensureSourceStandardReviewTask()`, `countPendingSourceReviewTasks()`, `transitionGovernanceReviewTask()`, `getGovernanceReviewTask()`.
- Produces API route: `GET/POST /api/v1/data-management/governance/review-tasks`.
- Produces web route: `/home/data-management/governance/review-tasks`.

- [ ] **Step 1: Update the governance API test names and paths first**

Assert that `POST /review-tasks/:id/start` records a reason and moves the review task to `in_progress`. Keep the old URL-timeout assertion out of the rewritten test so the production routes must change to pass.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/api/governance.test.ts`
Expected: FAIL because `/review-tasks/:id/start` returns 404.

- [ ] **Step 3: Rename schema exports, service symbols, API paths, worker imports, UI route, and links**

Use `governance_review_task`, `governance_review_task_event`, `governance_review_task_status_check`, `governance_review_task_priority_check`, `governance_review_task_status_priority_idx`, `governance_review_task_related_idx`, and `governance_review_task_event_task_created_idx` everywhere.

- [ ] **Step 4: Add the in-place SQL migration**

Create `apps/server/migrations/0038_separate_user_work_tasks.sql` that renames both tables, indexes, checks, primary key, and the event foreign key, then creates `user_work_task` and `user_work_task_event` with owner foreign keys, checks, and indexes. Register it in `apps/server/migrations/meta/_journal.json`; update the matching snapshot in the same task.

- [ ] **Step 5: Run focused server and web checks**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/api/governance.test.ts && pnpm check-types`
Run: `cd apps/web && pnpm check-types`
Expected: PASS, with database-only scenarios skipped unless explicitly enabled.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src apps/server/migrations apps/web/src docs
git commit -m "refactor: separate governance review tasks"
```

### Task 2: Implement personal task contracts and transactional service

**Files:**
- Create: `apps/server/src/lib/work-tasks/contracts.ts`
- Create: `apps/server/src/lib/work-tasks/service.ts`
- Create: `apps/server/src/lib/work-tasks/service.test.ts`
- Modify: `apps/server/src/db/schema/index.ts`

**Interfaces:**
- Produces: `WorkTaskStatus`, `WorkTaskPriority`, `WorkTaskCategory`, `WorkTaskSourceType`, `WorkTaskView`, `workTaskListQuerySchema`, `workTaskCreateSchema`, `workTaskPatchSchema`, `workTaskTransitionSchema`, `workTaskMoveSchema`.
- Produces: `listUserWorkTasks(input: ListUserWorkTasksInput): Promise<{ items: UserWorkTask[]; nextCursor: number | null }>`.
- Produces: `createUserWorkTask(userId: string, input: CreateUserWorkTaskInput): Promise<number>`.
- Produces: `transitionUserWorkTask(userId: string, id: number, input: TransitionUserWorkTaskInput): Promise<void>`.
- Produces: `moveUserWorkTask(userId: string, id: number, input: MoveUserWorkTaskInput): Promise<void>`.
- Produces: `resetUserWorkTaskOrder(userId: string, status: BoardStatus): Promise<void>`.
- Produces: `getUserWorkTask(userId: string, id: number): Promise<UserWorkTaskDetail | null>`.
- Produces: `getUserWorkTaskSummary(userId: string, localDate: string, timezone: string): Promise<WorkTaskSummary>`.

- [ ] **Step 1: Write failing contract tests**

Test valid timezone/date combinations, rejecting invalid IANA timezones and impossible local dates. Test title whitespace trimming and 1–120 length. Test rejecting owner, status, and arbitrary source snapshot fields from input.

- [ ] **Step 2: Run contract tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/work-tasks/service.test.ts`
Expected: FAIL because the contracts module does not exist.

- [ ] **Step 3: Implement Zod contracts**

Export the exact types and schemas above. `sourceType` and `sourceId` are both present or both omitted. Patch input contains no status, owner, source snapshot, sort order, or lifecycle timestamps.

- [ ] **Step 4: Write failing lifecycle and ordering tests**

Use the existing `ADMIN_DB_TESTS=1` database-test pattern to assert: completed tasks reopen; canceled tasks restore; leaving `in_progress` archives `blocked_reason`; cross-user reads and moves return `null`/throw not found; cross-column move writes one event; same-column move writes no event; reset order sorts high priority, due time, then creation.

- [ ] **Step 5: Run database tests and verify RED**

Run: `cd apps/server && ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/lib/work-tasks/service.test.ts`
Expected: FAIL because the service functions are missing.

- [ ] **Step 6: Implement the service transaction boundaries**

Use session-derived `userId` in every condition. Use a user/status advisory transaction lock for move/reset. Recompute integer sort order inside the transaction. Append events only for state changes, not edits or same-column ordering.

- [ ] **Step 7: Run tests and checks**

Run: `cd apps/server && ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/lib/work-tasks/service.test.ts`
Run: `cd apps/server && pnpm check-types && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/lib/work-tasks apps/server/src/db/schema
git commit -m "feat: add personal work task domain"
```

### Task 3: Add authenticated Work Task API and source snapshots

**Files:**
- Create: `apps/server/src/api/work-tasks.ts`
- Create: `apps/server/src/api/work-tasks.test.ts`
- Create: `apps/server/src/lib/work-tasks/source-resolver.ts`
- Modify: `apps/server/src/api/index.ts`

**Interfaces:**
- Produces routes under `/api/v1/work-tasks`.
- Produces: `resolveWorkTaskSource(userId: string, sourceType: WorkTaskSourceType, sourceId: string): Promise<WorkTaskSourceSnapshot | null>`.
- Produces: `GET /work-tasks`, `GET /work-tasks/summary`, `POST /work-tasks`, `GET /work-tasks/:id`, `PATCH /work-tasks/:id`, `POST /work-tasks/:id/transition`, `POST /work-tasks/:id/move`, `POST /work-tasks/order/reset`.

- [ ] **Step 1: Write failing API auth and ownership tests**

Inject a user resolver like the governance route tests. Assert 401 without a session, 400 for invalid date/timezone/body, 404 when user B requests user A's task, and 201 when user A creates a task without supplying an owner.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/api/work-tasks.test.ts`
Expected: FAIL because `/api/v1/work-tasks` is not mounted.

- [ ] **Step 3: Implement thin routes**

Read identity from `getCurrentUser`, validate every body/query with the contracts, map not-found to 404, validation to 400, and never pass an unverified user id into the service.

- [ ] **Step 4: Implement source resolution**

Resolve `stock` from `instrument`, `review` from `reviewDaily`, `screen` from `stockPool`, and `workflow_run` from a workflow run owned by the current user. Save only the snapshot fields needed by the task card/detail link. Return null for missing or unauthorized sources.

- [ ] **Step 5: Run tests and checks**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/api/work-tasks.test.ts && pnpm check-types && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/api apps/server/src/lib/work-tasks
git commit -m "feat: expose personal work task api"
```

### Task 4: Add frontend data hooks and pure view helpers

**Files:**
- Create: `apps/web/src/hooks/useWorkTasks.ts`
- Create: `apps/web/src/lib/work-tasks.ts`
- Create: `apps/web/src/lib/work-tasks.test.ts`

**Interfaces:**
- Produces query hooks for list, detail, and summary plus mutations for create/update/transition/move/reset.
- Produces: `localDateContext(): { localDate: string; timezone: string }`.
- Produces: `groupTodayTasks(items: UserWorkTask[]): Record<BoardStatus, UserWorkTask[]>`.
- Produces: `formatTaskDue(task: UserWorkTask, now: Date, localDate: string): { label: string; overdue: boolean }`.

- [ ] **Step 1: Write failing pure helper tests**

Assert grouping preserves server order, overdue uses `scheduledDate < localDate`, completed labels use completion time, and an invalid browser timezone falls back to `Asia/Shanghai`.

- [ ] **Step 2: Run web tests and verify RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/work-tasks.test.ts`
Expected: FAIL because `work-tasks.ts` does not exist.

- [ ] **Step 3: Implement helpers and TanStack Query hooks**

Use query keys under `["work-tasks"]`. Every query includes `localDate` and `timezone`. Create/update/transition/move/reset invalidate list, detail, and summary. Use `AbortSignal` for reads.

- [ ] **Step 4: Run tests and type check**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/work-tasks.test.ts && pnpm check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useWorkTasks.ts apps/web/src/lib/work-tasks.ts apps/web/src/lib/work-tasks.test.ts
git commit -m "feat: add work task client data layer"
```

### Task 5: Build the Work Task page, detail panel, and accessible drag board

**Files:**
- Create: `apps/web/src/routes/home/-private/WorkTaskPage.tsx`
- Create: `apps/web/src/routes/home/-private/WorkTaskBoard.tsx`
- Create: `apps/web/src/routes/home/-private/WorkTaskDetailPanel.tsx`
- Create: `apps/web/src/routes/home/-private/WorkTaskList.tsx`
- Modify: `apps/web/src/routes/home/tasks.tsx`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: all hooks and helpers from Task 4.
- Produces the `/home/tasks` production page with view query `today|inbox|future|all`, `@dnd-kit` drag handles, keyboard controls, mobile status buttons, detail panel, and loading/empty/error/partial-write states.

- [ ] **Step 1: Install only the planned drag dependencies**

Run: `pnpm --filter @ai-trader/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: package and lockfile update.

- [ ] **Step 2: Implement the page in the confirmed visual direction**

Reuse Preline components and semantic tokens. Keep 4 summary metrics, view tabs, three board columns, task cards, right-side detail panel, mobile full-width panel, and a visible mobile footer action bar.

- [ ] **Step 3: Implement drag behavior**

Start with an optimistic snapshot. Apply cross-column/status movement immediately. On failure restore the snapshot, keep other tasks unchanged, show an inline retryable error, and expose the same action through card buttons.

- [ ] **Step 4: Implement keyboard and reduced-motion behavior**

The drag handle is focusable with `aria-describedby` instructions. Keyboard status actions are available in the detail panel. Disable transition animation under `prefers-reduced-motion`.

- [ ] **Step 5: Run web verification**

Run: `cd apps/web && pnpm test && pnpm check-types && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 6: Capture production screenshots**

Use the real app at desktop and mobile widths in light/dark themes, including success, empty, loading, error, detail, drag, partial failure, and keyboard focus. Save under `docs/design/prototypes/explorations/screenshots/user-work-task-production/`.

- [ ] **Step 7: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml docs/design/prototypes
git commit -m "feat: implement personal work task board"
```

### Task 6: Add source entry points and sidebar summary count

**Files:**
- Create: `apps/web/src/components/AddWorkTaskButton.tsx`
- Modify: `apps/web/src/routes/home/market/analysis/-private/StockAnalysisDetail.tsx`
- Modify: `apps/web/src/routes/home/screens.tsx`
- Modify: `apps/web/src/routes/home/reviews/today.tsx`
- Modify: `apps/web/src/routes/home/workflows/runs/$runId.tsx`
- Modify: `apps/web/src/routes/home/route.tsx`
- Modify: `apps/web/src/lib/workbench-navigation.ts`

**Interfaces:**
- Consumes: work task create hook and source resolver API.
- Produces four entry actions that pass only `sourceType + sourceId` and navigate to `/home/tasks` with a prefilled create panel on failure to resolve.
- Produces sidebar today count, capped at `99+`.

- [ ] **Step 1: Add a shared source entry component**

Open `/home/tasks?sourceType=<type>&sourceId=<id>` and let the create panel call the server. Do not submit client-authored snapshots.

- [ ] **Step 2: Wire the four sources**

Use current stock symbol, selected screen-row symbol, current review date, and current run id. Show an inline error if no source is selected.

- [ ] **Step 3: Wire the sidebar count**

Query the summary from `HomeLayout`; count today's pending/in-progress tasks. Keep the static layout when the query is loading or unavailable.

- [ ] **Step 4: Verify**

Run: `cd apps/web && pnpm check-types && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat: link task sources from workbench pages"
```

### Task 7: Add controlled AI task draft tool

**Files:**
- Create: `apps/server/src/agent/mastra/tools/work-task-tool.ts`
- Create: `apps/server/src/agent/mastra/tools/work-task-tool.test.ts`
- Modify: `apps/server/src/agent/mastra/tools/index.ts`
- Modify: `apps/server/src/agent/mastra/agents/stock-analyst.ts`
- Modify: `apps/web/src/routes/ai-chat/-private/ChatPanel.tsx`
- Modify: `apps/web/src/routes/home/-private/WorkTaskDetailPanel.tsx`

**Interfaces:**
- Produces: `proposeWorkTaskTool`, which returns `{ title, description, category, priority, scheduledDate, sourceType?, sourceId? }` and never writes.
- Produces a chat action that opens the Work Task create panel with that draft; only the user's create click persists it.

- [ ] **Step 1: Write a failing tool contract test**

Assert the tool rejects requests that ask it to complete/cancel a task, never calls a write function, and returns only allowlisted draft fields.

- [ ] **Step 2: Run the test and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/agent/mastra/tools/work-task-tool.test.ts`
Expected: FAIL because the tool is missing.

- [ ] **Step 3: Implement the non-writing tool and handoff UI**

Register it on `stockAnalyst`. Detect its result in the chat panel and render “打开任务草稿”; pass the draft through navigation and require a normal create request.

- [ ] **Step 4: Verify**

Run: `cd apps/server && pnpm check-types && pnpm lint`
Run: `cd apps/web && pnpm check-types && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent apps/web/src/routes
git commit -m "feat: add controlled ai work task drafts"
```

### Task 8: Verification, documentation, and archive

**Files:**
- Modify: `docs/standards/database.md`
- Modify: `docs/data-governance/catalog.md`
- Modify: `docs/design/prototypes/README.md`
- Modify: `openspec/changes/add-user-work-task-module/tasks.md`
- Create: `openspec/changes/add-user-work-task-module/verification.md`

**Interfaces:**
- Produces the final verification report and updated long-lived terminology.

- [ ] **Step 1: Run full verification**

Run: `pnpm check-types`
Run: `pnpm lint`
Run: `pnpm build`
Run: `cd apps/server && ADMIN_DB_TESTS=1 pnpm test`
Expected: PASS, or document any environment-only skipped database checks.

- [ ] **Step 2: Update docs and task checkboxes**

Mark only tasks with observed test evidence complete. Record migration, API, UI, source, AI, accessibility, and screenshot evidence in `verification.md`.

- [ ] **Step 3: Validate OpenSpec**

Run: `openspec validate add-user-work-task-module --strict`
Expected: PASS.

- [ ] **Step 4: Commit and archive only after verification**

```bash
git add docs openspec
git commit -m "docs: verify personal work task module"
openspec archive add-user-work-task-module --yes
```
