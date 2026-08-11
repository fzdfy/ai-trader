# ============================================================
#  Server / Worker — Node.js 运行镜像
#  CMD 在 docker-compose 中指定为 server 或 worker
# ============================================================
FROM node:24.19.0-alpine

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# 一次性复制所有文件
COPY . .

# 安装全部依赖
RUN pnpm install --frozen-lockfile

# 默认命令：API server（docker-compose 中 worker 会覆盖）
CMD ["pnpm", "--prefix", "apps/server", "start"]
