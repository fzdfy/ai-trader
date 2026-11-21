# Docker Host Port Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Docker 宿主机端口与本地开发端口分开，同时保持容器内部端口和通信不变。

**Architecture:** Compose 为每个发布端口提供 `DOCKER_*_PORT` 默认值；本地进程继续使用 9080/3001/3002/5432，Docker 使用 9180/3101/3102/5532。zrok 只暴露 HTTP，数据库保持不共享。

**Tech Stack:** Docker Compose、zrok2、PostgreSQL、nginx、Node/Vite。

**Spec:** `docs/superpowers/specs/2026-11-21-docker-host-port-isolation-design.md`

## Global Constraints

- 只改宿主机发布端口，不改容器内部端口。
- 本地开发端口保持 9080/3001/3002/5432。
- Docker 默认端口为 9180/3101/3102/5532。
- Docker 内部继续使用 server:3001、postgres:5432、quant:3002。
- zrok HTTP → 9180；禁止创建数据库 TCP share。
- 未提交的现有变更必须保留。
- Visual design: not applicable。

## Review Focus

- 端口只改了一半导致 zrok 或本地 DB 断连。
- 内部服务也改端口导致 nginx/worker 失效。
- `.env.local` 未切到 5532。
- 文档/脚本仍展示旧端口。
- 双 localhost 端口共享 Cookie 的风险。
- 误建数据库 TCP share 导致 PostgreSQL 暴露。

### Task 1: Compose host ports

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `.env.local`

**Interfaces:**
- Produces: `DOCKER_WEB_PORT=9180`
- Produces: `DOCKER_SERVER_PORT=3101`
- Produces: `DOCKER_QUANT_PORT=3102`
- Produces: `DOCKER_POSTGRES_PORT=5532`
- Produces: `DOCKER_LOKI_PORT=3200`
- Produces: `DOCKER_ALLOY_PORT=12445`
- Produces: `DOCKER_GRAFANA_PORT=3110`

- [ ] **Step 1: Capture current host ports**

Run: `docker compose config | rg -n "published|target|BETTER_AUTH_URL"`.
Expected: current 9080/3001/3002/5432 publishing.

- [ ] **Step 2: Replace published ports with defaulted variables**

Only edit the `ports` values. Keep all container target values unchanged. Set Docker local auth default to `http://localhost:9180` and local `.env.local` Docker DB URL to `localhost:5532`.

- [ ] **Step 3: Verify Compose**

Run: `docker compose config`.
Expected: host ports 9180/3101/3102/5532/3200/12445/3110 and internal targets unchanged.

### Task 2: Scripts and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/standards/workflow.md`
- Modify: `apps/server/.env.example`
- Modify: `deploy/*.sh`
- Modify: `apps/web/src/generated/knowledge.ts` via generator

- [ ] **Step 1: Update all current-address references**

Use Docker ports for Docker-only addresses and preserve local dev ports in local-development descriptions.

- [ ] **Step 2: Regenerate knowledge**

Run: `node scripts/generate-knowledge.mjs` from `apps/web`.
Expected: generated knowledge succeeds.

### Task 3: zrok HTTP target rotation

**Files:**
- Modify: `.env.public`
- Modify: `.env.public.example`
- External: zrok2 public share

- [ ] **Step 1: Recreate Docker stacks on new ports**

Run public compose up with recreation.

- [ ] **Step 2: Restart zrok HTTP share at 9180**

Stop the existing `zrok2 share public 9080`, start `zrok2 share public 9180`, capture new URL.

- [ ] **Step 3: Update auth URL and origins**

Write the new public URL to `.env.public` and `.env.public.example`, then recreate server.

- [ ] **Step 4: Remove any database TCP share**

Confirm zrok account contains only the HTTP Web share and no PostgreSQL TCP share.

### Task 4: Verification

- [ ] Run targeted auth/CORS tests.
- [ ] Run full server tests with `.env.local`.
- [ ] Run type, lint and format checks.
- [ ] Verify Compose published/internal ports.
- [ ] Verify local web, public web, trusted/unknown CORS and DB on 5532.
- [ ] Verify zrok provides only the HTTP Web share.
- [ ] Write `verification.md`.
