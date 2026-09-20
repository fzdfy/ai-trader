#!/usr/bin/env bash
# ============================================================
#  AI Trader — deploy 脚本公共函数库
#
#  用法：在模块脚本中通过以下方式引入：
#    source "$(cd "$(dirname "$0")" && pwd)/_common.sh"
#
#  提供：彩色日志、仓库根定位、docker 检查、依赖拉起、等待 DB、日志跟随。
#  这不是一个可单独执行的脚本，仅作为函数库被 source。
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
info() { echo -e "${BLUE}[·]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ---- 公共选项（由 parse_common_args 填充）----
OPT_BUILD=0
OPT_FOLLOW=0
OPT_NO_DEPS=0

# parse_common_args <usage_fn> "$@"
#   解析各模块脚本共用的选项；-h/--help 时调用 usage_fn 并退出。
parse_common_args() {
  local usage_fn="$1"
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help)    "$usage_fn"; exit 0 ;;
      --build)      OPT_BUILD=1 ;;
      -f|--follow)  OPT_FOLLOW=1 ;;
      --no-deps)    OPT_NO_DEPS=1 ;;
      *)            fail "未知参数：$1（使用 --help 查看用法）" ;;
    esac
    shift
  done
}

require_docker() {
  command -v docker >/dev/null 2>&1 || fail "未安装 Docker，请先安装 Docker Desktop"
  docker compose version >/dev/null 2>&1 || fail "未找到 docker compose 插件（需要 Docker Compose v2）"
}

# 确保 .env.local 存在（不存在则从模板创建）
ensure_env() {
  if [ ! -f .env.local ]; then
    cp apps/server/.env.example .env.local
    warn "已从模板创建 .env.local，请填入 DEEPSEEK_API_KEY 和 BETTER_AUTH_SECRET"
  fi
}

# service_running <service> — 该 compose 服务的容器是否正在运行
service_running() {
  local svc="$1"
  local cid
  cid="$(docker compose ps -q "$svc" 2>/dev/null || true)"
  [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)" = "true" ]
}

# wait_for_postgres — 阻塞直到 PostgreSQL 就绪
wait_for_postgres() {
  info "等待数据库就绪..."
  local retry=0
  until docker compose exec -T postgres pg_isready -U ai-trader >/dev/null 2>&1; do
    sleep 2
    retry=$((retry + 1))
    if [ "$retry" -ge 30 ]; then
      fail "PostgreSQL 启动超时"
    fi
  done
  log "PostgreSQL 已就绪"
}

# ensure_deps <service...> — 按需拉起依赖服务
ensure_deps() {
  local svc
  for svc in "$@"; do
    if service_running "$svc"; then
      info "依赖服务 $svc 已在运行"
    else
      info "拉起依赖服务 $svc ..."
      docker compose up -d "$svc"
      if [ "$svc" = "postgres" ]; then
        wait_for_postgres
      fi
    fi
  done
}

# compose_up <service...> — 按 OPT_NO_DEPS 决定是否级联启动依赖
compose_up() {
  local -a args=(up -d)
  [ "$OPT_NO_DEPS" -eq 1 ] && args+=(--no-deps)
  docker compose "${args[@]}" "$@"
}

# start_module <service> [deps...] — 构建（可选）+ 拉起依赖 + 启动服务
start_module() {
  local svc="$1"
  shift
  local deps=("$@")

  require_docker
  ensure_env

  if [ "$OPT_NO_DEPS" -eq 0 ] && [ "${#deps[@]}" -gt 0 ]; then
    ensure_deps "${deps[@]}"
  fi

  if [ "$OPT_BUILD" -eq 1 ]; then
    info "构建镜像 $svc ..."
    docker compose build "$svc"
  fi

  info "启动 $svc ..."
  compose_up "$svc"
  log "$svc 已启动"
}

# follow_logs [service] — 若开启 -f/--follow 则跟随日志；不传参数则跟随全部
follow_logs() {
  if [ "$OPT_FOLLOW" -eq 1 ]; then
    info "跟随日志（Ctrl+C 退出，不影响容器运行）..."
    if [ $# -gt 0 ]; then
      docker compose logs -f "$1"
    else
      docker compose logs -f
    fi
  fi
}
