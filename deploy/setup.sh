#!/usr/bin/env bash
# ============================================================
#  AI Trader — 一键部署脚本（在目标 Mac 机器上首次运行）
#  访问：http://localhost:3001（前端 + API 单端口）
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo "============================================"
echo "  AI Trader 环境部署"
echo "============================================"
echo ""

# ---- 1. 检查前置依赖 ----
log "检查前置依赖..."

command -v node   >/dev/null 2>&1 || fail "未安装 Node.js，请先安装：brew install node@20"
command -v pnpm   >/dev/null 2>&1 || fail "未安装 pnpm，请先安装：npm i -g pnpm"
command -v docker >/dev/null 2>&1 || fail "未安装 Docker，请先安装 Docker Desktop"
command -v uv     >/dev/null 2>&1 || fail "未安装 uv，请先安装：brew install uv"

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 20 ]; then
  fail "Node.js 版本过低（需要 >= 20），当前：$(node -v)"
fi

log "Node.js $(node -v) · pnpm $(pnpm -v) · uv $(uv --version | head -1)"

# ---- 2. 环境变量 ----
log "配置环境变量..."

if [ ! -f .env.local ]; then
  cp apps/server/.env.example .env.local
  warn "已从模板创建 .env.local，请检查并填入 DEEPSEEK_API_KEY"
fi

# ---- 3. 启动 PostgreSQL + pgvector ----
log "启动 PostgreSQL（含 pgvector）..."

docker compose up -d --wait 2>/dev/null || docker compose up -d

# 等 postgres 就绪
log "等待 PostgreSQL 就绪..."
RETRY=0
until docker compose exec -T postgres pg_isready -U ai-trader 2>/dev/null; do
  sleep 2
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge 15 ]; then
    fail "PostgreSQL 启动超时，请检查 docker compose logs postgres"
  fi
done
log "PostgreSQL 已就绪"

# ---- 4. 安装 Node.js 依赖 ----
log "安装 Node.js 依赖（pnpm install）..."
pnpm install --frozen-lockfile

# ---- 5. 数据库迁移 ----
log "执行数据库迁移..."
pnpm db:migrate

# ---- 6. Python 依赖 ----
log "安装 Python 依赖（quant 服务）..."
cd apps/quant && uv sync && cd ../..

# ---- 7. 同步基础数据 ----
log "同步 A 股标的字典..."
pnpm sync-instruments
log "同步板块数据..."
node --import @oxc-node/core/register --env-file=.env.local apps/server/src/workers/sync-worker/pipes/boards.ts 2>/dev/null || warn "板块数据同步跳过（可能网络不稳定）"

# ---- 8. 构建前端 ----
log "构建前端..."
pnpm --prefix apps/web build
log "前端构建完成 → apps/web/dist/"

# ---- 完成 ----
echo ""
echo "============================================"
echo -e "${GREEN}  部署完成！${NC}"
echo "============================================"
echo ""
echo "  启动所有服务："
echo "    ./deploy/start.sh"
echo ""
echo "  访问地址："
echo "    http://localhost:3001       前端页面"
echo "    http://localhost:3001/signup  注册账号"
echo "    http://localhost:3001/health  API 健康检查"
echo "    http://localhost:3002/docs    quant API 文档"
echo ""
echo "  还需要在 .env.local 中填入："
echo "    DEEPSEEK_API_KEY=sk-...  （DeepSeek API Key）"
echo ""
