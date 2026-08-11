#!/usr/bin/env bash
# ============================================================
#  AI Trader — 启动所有服务（production 模式）
#  访问：http://localhost:3001（前端 + API 单端口）
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

# 构建前端
log "构建前端..."
pnpm run build:web
log "前端构建完成 → apps/web/dist/"

# 启动 quant 回测（后台）
log "启动 quant 回测服务 :3002"
pnpm quant:start &
QUANT_PID=$!

# 启动 sync worker（后台）
log "启动 sync worker"
pnpm run worker:sync &
WORKER_PID=$!

sleep 1

# 启动 server（前台，附带静态文件托管）
log "启动 server :3001"
echo -e "${YELLOW}访问 http://localhost:3001${NC}"
echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"
echo ""
pnpm run start:server

# 前台进程退出后，清理后台服务
kill $QUANT_PID $WORKER_PID 2>/dev/null || true
log "所有服务已停止"
