# ============================================================
#  Server / Worker — Node.js 运行镜像
#  CMD 在 docker-compose 中指定为 server 或 worker
# ============================================================
FROM node:24.19.0-alpine

# pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# 安装全部依赖（server + worker 共享）
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/ packages/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile

# 复制服务端源码
COPY apps/server/ apps/server/

# 默认命令：API server（docker-compose 中 worker 会覆盖）
CMD ["pnpm", "--prefix", "apps/server", "start"]
