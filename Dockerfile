# 生产镜像：一个 Dockerfile 两个产物，compose 通过 target 选择
#   server → 后端 API（node）
#   web    → 管理后台静态站 + /api、/uploads 反向代理（nginx）
#
# 关键约束：生产 NODE_ENV=production 时 TypeORM 关闭 synchronize，
# 所以 server 启动前必须先跑 migration（见 CMD）。
#
# 基础镜像用 alpine：体积小、国内拉取快。
# 生产依赖里没有需要就地编译的原生模块（better-sqlite3 带 musl 预编译二进制），
# 构建阶段不装编译工具链；Node 自带 ICU 时区数据，TZ 无需系统 tzdata 包。

# ---------- 依赖层：pnpm workspace 需要三个子包清单一起参与解析 ----------
FROM node:22-alpine AS deps
WORKDIR /repo
RUN npm i -g pnpm@12.4.2
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY server/package.json ./server/package.json
COPY admin/package.json ./admin/package.json
COPY app/package.json ./app/package.json
RUN pnpm install --frozen-lockfile

# ---------- 后端 ----------
FROM deps AS server-build
COPY server ./server
RUN pnpm --filter server build \
 && pnpm --filter server deploy --prod /out

FROM node:22-alpine AS server
# 健康检查用容器内已有的 node 发 fetch；时区走 Node 自带 ICU，不额外装 tzdata
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3000 \
    UPLOAD_DIR=/app/uploads
WORKDIR /app
COPY --from=server-build /out/dist ./dist
COPY --from=server-build /out/node_modules ./node_modules
COPY --from=server-build /out/package.json ./package.json
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 3000
# 迁移幂等：已执行过会跳过，不会重复建表
CMD ["sh", "-c", "node ./node_modules/typeorm/cli.js migration:run -d dist/db/data-source.js && node dist/index.js"]

# ---------- 管理后台 ----------
FROM deps AS admin-build
COPY admin ./admin
# 默认同域反代；前后端分域名时改成 https://api.example.com/api
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter admin build

FROM nginx:stable-alpine AS web
ENV TZ=Asia/Shanghai
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=admin-build /repo/admin/dist /usr/share/nginx/html
EXPOSE 80
