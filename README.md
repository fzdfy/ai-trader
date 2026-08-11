# ai-trader

智能 A 股分析与策略平台。

## 技术栈

| 服务 | 技术 | 端口 |
|------|------|------|
| web 前端 | React 19 + Vite + TanStack Router | 5173 |
| server API | Hono + Drizzle + PostgreSQL | 3001 |
| quant 回测 | FastAPI + AKQuant (Python/uv) | 3002 |
| database | PostgreSQL 18 + pgvector | 5432 |

## 部署到新机器

### 前置依赖

确保已安装：

```bash
# macOS
brew install node@20 pnpm docker uv

# 启动 Docker Desktop 后再继续
```

### 一键部署

```bash
# 1. 克隆项目
git clone <repo-url> ai-trader && cd ai-trader

# 2. 运行部署脚本
chmod +x deploy/*.sh
./deploy/setup.sh

# 3. 编辑 .env.local，填入 DeepSeek API Key
#    DEEPSEEK_API_KEY=sk-...

# 4. 启动所有服务
./deploy/start.sh
```

### 访问

| 地址 | 说明 |
|------|------|
| http://localhost:3001 | 前端页面（单端口，含 API） |
| http://localhost:3001/signup | 注册账号 |
| http://localhost:3001/health | API 健康检查 |
| http://localhost:3002/docs | quant API 文档 |

### 日常操作

```bash
./deploy/start.sh    # 启动所有服务
./deploy/stop.sh     # 停止所有服务

# 数据库迁移（修改 schema 后）
pnpm db:generate      # 生成迁移文件
pnpm db:migrate       # 执行迁移

# 同步数据
pnpm sync-instruments  # A 股标的字典
```

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | 是 |
| `BETTER_AUTH_SECRET` | 认证加密密钥 | 是 |
| `BETTER_AUTH_URL` | 认证服务地址 | 是 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（AI Agent） | 是 |
| `QUANT_URL` | 回测服务地址 | 否 |

完整清单见 `apps/server/.env.example`。

## 开发

```bash
pnpm install          # 安装依赖
docker compose up -d  # 启动 PostgreSQL
pnpm db:migrate       # 初始化数据库
pnpm dev              # 启动开发模式（server + web + quant）
```
