# ai-trader

智能 A 股分析与策略平台（Docker Compose 全容器部署）。

## 架构

```
浏览器 → :80 (nginx)
           ├── /*         → dist/ 静态文件（SPA fallback）
           └── /api/*     → server:3001 (Hono API)
                              ├── postgres:5432 (数据库)
                              └── quant:3002 (回测)

worker       — 定时数据同步 → postgres:5432
```

## 部署到新机器

### 前置依赖

```bash
# macOS
brew install docker
# 启动 Docker Desktop 后再继续
```

### 一键部署

```bash
git clone <repo-url> ai-trader && cd ai-trader
chmod +x deploy/*.sh
./deploy/setup.sh

# 编辑 .env.local，填入：
#   DEEPSEEK_API_KEY=sk-...
#   BETTER_AUTH_SECRET=<随机64字符>

# 重启使环境变量生效
docker compose up -d
```

### 访问

| 地址 | 说明 |
|------|------|
| http://localhost | 前端页面 |
| http://localhost/signup | 注册账号 |
| http://localhost/health | API 健康检查 |
| http://localhost:3002/docs | quant API 文档 |

### 容器管理

```bash
./deploy/start.sh           # 启动全部服务
./deploy/stop.sh            # 停止全部服务
docker compose logs -f      # 查看日志
./deploy/start.sh --build   # 重新构建并启动全部
docker compose restart server # 重启单个服务
```

### 按模块单独启动

每个模块都有独立的启动脚本，可单独启动/停止，互不影响：

| 脚本 | 模块 | 容器名 | 端口 | 依赖 |
|------|------|--------|------|------|
| `./deploy/start-db.sh` | 数据库（postgres + pgvector） | aitrader-postgres | 5432 | — |
| `./deploy/start-server.sh` | API 服务 | aitrader-server | 3001 | postgres |
| `./deploy/start-worker.sh` | 数据同步 Worker | aitrader-worker | — | postgres |
| `./deploy/start-quant.sh` | 回测微服务 | aitrader-quant | 3002 | postgres |
| `./deploy/start-web.sh` | 前端（nginx） | aitrader-nginx | 9080 | server |

```bash
./deploy/start-server.sh              # 启动 server（自动拉起 postgres）
./deploy/start-web.sh --build         # 重新构建并启动前端
./deploy/start-worker.sh -f           # 启动并跟随日志
./deploy/start-quant.sh --no-deps     # 不自动拉起依赖服务

./deploy/stop.sh db                   # 停止单个模块（db/server/worker/quant/web）
```

所有 `start-*.sh` 支持：`--build`（构建）、`-f/--follow`（跟随日志）、`--no-deps`（不自动拉起依赖）、`-h/--help`（帮助）。


## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串（Docker 自动覆盖） | 是 |
| `BETTER_AUTH_SECRET` | 认证加密密钥 | 是 |
| `BETTER_AUTH_URL` | 认证服务地址（Docker 自动覆盖） | 是 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（AI Agent） | 是 |
| `QUANT_URL` | 回测服务地址（Docker 自动覆盖） | 否 |

## 本地开发（非 Docker）

```bash
pnpm install
docker compose up -d postgres  # 仅启动数据库
pnpm db:migrate
pnpm dev                       # turbo dev + quant:dev
```
