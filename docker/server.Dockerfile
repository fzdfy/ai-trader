# ============================================================
#  Server / Worker — Node.js 运行镜像
#  CMD 在 docker-compose 中指定为 server 或 worker
# ============================================================
FROM node:24.19.0-alpine

# 交易日历/时段判断依赖本地时区，统一用上海时区
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# 先复制依赖清单，使依赖安装层可缓存（源码改动不触发重装）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/lint/package.json packages/lint/package.json

# 安装全部依赖
RUN pnpm install --frozen-lockfile

# 再复制源码
COPY . .

EXPOSE 3001

# 默认命令：API server（docker-compose 中 worker 会覆盖）
CMD ["pnpm", "--prefix", "apps/server", "start"]
