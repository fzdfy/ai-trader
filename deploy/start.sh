#!/usr/bin/env bash
# ============================================================
#  AI Trader — 启动所有服务
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log() { echo -e "${GREEN}[✓]${NC} $1"; }

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 确保 PostgreSQL 运行中
log "检查 PostgreSQL..."
docker compose up -d 2>/dev/null || true

# 启动 quant 回测（后台）
log "启动 quant 回测服务 :3002"
cd apps/quant && uv run uvicorn main:app --host 0.0.0.0 --port 3002 &
QUANT_PID=$!
cd "$PROJECT_DIR"

# 启动 server API（后台，通过 dotenvx 注入环境变量）
log "启动 server API :3001"
npx dotenvx run -f .env.local -- node --import @oxc-node/core/register apps/server/src/index.ts &
SERVER_PID=$!

# 启动 sync worker（后台）
log "启动 sync worker"
npx dotenvx run -f .env.local -- node --import @oxc-node/core/register apps/server/src/workers/sync-worker/index.ts &
WORKER_PID=$!

sleep 2

# 启动 web 前端（前台，Ctrl+C 停止所有服务）
log "启动 web 前端 :5173"
echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"
echo ""
npx dotenvx run -f .env.local -- npx --prefix apps/web vite --host 0.0.0.0 --port 5173 || true

# 前台进程退出后，清理后台服务
kill $QUANT_PID $SERVER_PID $WORKER_PID 2>/dev/null || true
log "所有服务已停止"
