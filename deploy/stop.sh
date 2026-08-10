#!/usr/bin/env bash
# ============================================================
#  AI Trader — 停止所有服务
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'
NC='\033[0m'
log() { echo -e "${GREEN}[✓]${NC} $1"; }

log "停止所有 AI Trader 进程..."
pkill -f "uvicorn main:app"     2>/dev/null || true
pkill -f "sync-worker"           2>/dev/null || true
pkill -f "@oxc-node/core/register.*vite" 2>/dev/null || true
pkill -f "vite.*5173"            2>/dev/null || true
pkill -f "@oxc-node/core/register.*src/index" 2>/dev/null || true

log "服务已全部停止"
