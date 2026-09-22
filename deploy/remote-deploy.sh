#!/usr/bin/env bash
# ============================================================
#  AI Trader — 本地一键远程部署（生产机 Docker Compose）
#
#  在本地开发机执行本脚本，通过 SSH（cloudflared 隧道）登录生产机：
#    git fetch → git checkout → git pull --ff-only → ./deploy/start.sh --build
#
#  前置条件（一次性，详见 --help）：
#    1. 生产机已 clone 本仓库，并以 Docker Compose 方式部署
#    2. 本地已安装 cloudflared，并在 ~/.ssh/config 配好生产机 Host
#    3. 该 Host 可免密登录（ssh-copy-id，或至少能交互输入密码）
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

DEPLOY_HOST="${DEPLOY_HOST:-aitrader-prod}"
DEPLOY_DIR="${DEPLOY_DIR:-~/ai-trader}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

OPT_REMOTE_BUILD=1
OPT_DRY_RUN=0
REMOTE_START_ARGS=()

usage() {
  cat <<'EOF'
用法: ./deploy/remote-deploy.sh [选项]

在本地一条命令完成生产环境部署：
  SSH 登录生产机 → cd 仓库 → git pull --ff-only → ./deploy/start.sh --build

选项:
  --host <别名>     生产机 SSH 主机别名（默认 aitrader-prod）
  --dir <路径>      生产机上的仓库路径（默认 ~/ai-trader）
  --branch <分支>   要部署的分支（默认 main）
  --no-build        不重建镜像，仅 git pull 后重启容器
  -f, --follow      部署完成后跟随日志（Ctrl+C 只断开本地连接，容器不受影响）
  --dry-run         只打印将要执行的远程命令，不真正执行
  -h, --help        显示本帮助

环境变量（与同名选项等价）:
  DEPLOY_HOST / DEPLOY_DIR / DEPLOY_BRANCH

一次性前置配置:
  1) 在 cloudflared 隧道上加一条 SSH 入口（Cloudflare Zero Trust 控制台）
       Networks → Tunnels → 选中隧道 → Public Hostnames → Add
         Subdomain/Domain  ssh.<你的域名>
         Service           SSH  →  ssh://localhost:22
     之后在 Access → Applications 为 ssh.<你的域名> 建一条策略，
     只允许你自己的邮箱通过（需要网页终端时选 Browser rendering: SSH）。

  2) 本地安装 cloudflared 并配置 ~/.ssh/config
       brew install cloudflared

       Host aitrader-prod
         HostName ssh.<你的域名>
         User <生产机用户名>
         ProxyCommand cloudflared access ssh --hostname %h

  3) 首次连接后写入公钥，实现后续免密
       ssh-copy-id aitrader-prod

示例:
  ./deploy/remote-deploy.sh                 # 拉取 main，重建并重启
  ./deploy/remote-deploy.sh --no-build      # 只重启，不重建镜像
  ./deploy/remote-deploy.sh -f              # 部署后跟随日志
  ./deploy/remote-deploy.sh --branch dev    # 部署 dev 分支
  ./deploy/remote-deploy.sh --dry-run       # 预览将执行的远程命令
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)   usage; exit 0 ;;
    --host)      [ $# -ge 2 ] || fail "--host 需要一个参数"; DEPLOY_HOST="$2"; shift ;;
    --dir)       [ $# -ge 2 ] || fail "--dir 需要一个参数"; DEPLOY_DIR="$2"; shift ;;
    --branch)    [ $# -ge 2 ] || fail "--branch 需要一个参数"; DEPLOY_BRANCH="$2"; shift ;;
    --no-build)  OPT_REMOTE_BUILD=0 ;;
    -f|--follow) REMOTE_START_ARGS+=(-f) ;;
    --dry-run)   OPT_DRY_RUN=1 ;;
    *)           fail "未知参数：${1}（使用 --help 查看用法）" ;;
  esac
  shift
done

[ -n "$DEPLOY_HOST" ] || fail "--host 不能为空"
[ -n "$DEPLOY_DIR" ] || fail "--dir 不能为空"
[ -n "$DEPLOY_BRANCH" ] || fail "--branch 不能为空"
command -v ssh >/dev/null 2>&1 || fail "未找到 ssh 命令"

Q_DIR="$(printf '%q' "$DEPLOY_DIR")"
Q_BRANCH="$(printf '%q' "$DEPLOY_BRANCH")"

start_args=""
if [ "$OPT_REMOTE_BUILD" -eq 1 ]; then
  start_args=" --build"
fi
for a in ${REMOTE_START_ARGS[@]+"${REMOTE_START_ARGS[@]}"}; do
  start_args="$start_args $(printf '%q' "$a")"
done

remote_script="$(cat <<REMOTE
set -euo pipefail
cd $Q_DIR
echo "[remote] 仓库目录：\$(pwd)"
echo "[remote] git fetch --prune origin"
git fetch --prune origin
echo "[remote] git checkout $Q_BRANCH"
git checkout $Q_BRANCH
echo "[remote] git pull --ff-only origin $Q_BRANCH"
git pull --ff-only origin $Q_BRANCH
echo "[remote] 当前提交："
git log -1 --oneline
test -x ./deploy/start.sh || { echo "[remote] 未找到可执行的 ./deploy/start.sh" >&2; exit 1; }
echo "[remote] ./deploy/start.sh$start_args"
./deploy/start.sh$start_args
REMOTE
)"

info "生产机：${DEPLOY_HOST}"
info "仓库：${DEPLOY_DIR}（分支 ${DEPLOY_BRANCH}）"

if [ "$OPT_DRY_RUN" -eq 1 ]; then
  echo ""
  echo "----- 将在生产机执行的命令 -----"
  echo "$remote_script"
  echo "-------------------------------"
  exit 0
fi

SSH_OPTS=(-o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6)
if [ -t 0 ] && [ -t 1 ]; then
  SSH_OPTS+=(-t)
fi

info "连接生产机并开始部署..."
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$remote_script"; then
  warn "若为连接失败，请检查："
  echo "  1. ~/.ssh/config 中是否已有 Host ${DEPLOY_HOST}（HostName / User / ProxyCommand）"
  echo "  2. 本地是否已安装 cloudflared： brew install cloudflared"
  echo "  3. 隧道上是否已添加 SSH 入口，且 Access 策略允许你的账号"
  echo "  4. 能否手动登录：ssh ${DEPLOY_HOST}"
  fail "远程部署失败"
fi

log "生产环境部署完成"
