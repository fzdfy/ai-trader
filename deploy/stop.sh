#!/usr/bin/env bash
# ============================================================
#  AI Trader — 停止所有服务
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "停止所有容器..."
docker compose down

echo "服务已全部停止"
