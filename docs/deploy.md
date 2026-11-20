# Docker 生产部署

后端 API 与管理后台静态页由同一份 `docker-compose.prod.yml` 编排，
数据库用 PostgreSQL 容器，宿主机不用装 Node / pnpm；本次部署不含 App 端。

## 部署拓扑

```
             ┌──────────────────────────────┐
 浏览器 ─────▶│ web (nginx :80)              │
             │  /            管理后台静态页  │
             │  /api  /uploads  ──┐         │
             └────────────────────┼─────────┘
                                  ▼
             ┌──────────────────────────────┐
             │ server (node :3000，不对外)  │──▶ uploads 卷（上传文件）
             └───────────────┬──────────────┘
                             ▼
             ┌──────────────────────────────┐
             │ db (postgres:16，不对外)     │──▶ pgdata 卷
             └──────────────────────────────┘
```

- 只有 `web` 的端口暴露到宿主机；数据库和后端都在 compose 内网，不映射端口。
- 上传文件、数据库都在命名卷里，`down` 不会丢数据，删卷才会。

## 服务器前置条件

- Docker 24+ 与 `docker compose` 插件（`docker compose version` 有输出）
- 建议 2 核 4G 以上；**在服务器上构建**需要约 2GB 可用内存（pnpm 安装 + 前端编译）
- 默认对外端口 **8092**（`HTTP_PORT`，compose 里已是默认值，`.env.production` 不填也生效）
- 有域名时建议在外面再套一层 HTTPS
- 镜像基于 `node:22-alpine` / `nginx:stable-alpine`：构建与运行镜像都不装 apk 编译工具（better-sqlite3 用自带 musl 预编译二进制），体积小、拉取快

## 首次部署

```bash
git clone <repo> && cd keel-admin

# 1. 生成生产环境变量（会填好随机的 POSTGRES_PASSWORD / JWT_SECRET / DATA_SOURCE_SECRET）
bash scripts/deploy.sh up

# 2. 按提示确认 .env.production，再执行一次
bash scripts/deploy.sh up
```

第一次运行只做环境变量初始化就退出，是有意为之：避免用默认超管密码直接跑起来。
需要改的至少这三项：

| 变量 | 说明 |
| --- | --- |
| `SEED_ADMIN_PASSWORD` | 首次启动创建的超管密码，登录后立即改 |
| `CORS_ORIGIN` | 同域反代保持 `*`；前后端分域名时填具体域名 |
| `WECHAT_MOCK` | 本次未部署 App 端，可保持 `true`；后续部署 App 微信登录时必须 `false` 并填 `WECHAT_APPID` / `WECHAT_SECRET` |

`DATA_SOURCE_SECRET` 必须是 ≥16 位随机串（脚本已自动填），留空会导致后端启动时 zod 校验失败并反复重启。

脚本会依次：构建镜像 → 启动 db/server/web → 等数据库与后端健康检查 → 请求 `/api/health` 冒烟 → 打印访问地址。
首次启动时 server 会**先跑迁移建表、再写幂等种子**（菜单、字典、超管账号），不需要手动初始化数据库。

「在线开发」三个菜单（数据建模 / 数据接口 / 表单设计）的演示数据也由种子写入：`demo-seed.ts` 会补齐演示连接、3 张演示业务表（`demo_customer` / `demo_purchase_order` / `demo_purchase_order_item`）的元数据、3 个模型、3 个接口、2 个已发布表单与 3 条订单演示数据，并在 uploads 卷生成演示图片与合同附件。重复启动只补缺失记录，不覆盖已有数据；演示表结构由 `DemoBusinessTables` 迁移创建，生产环境随启动自动执行。

同时会创建演示账号 `demo`（密码取 `SEED_DEMO_PASSWORD`，仅首次创建生效），绑定内置角色 `demo`：在线开发四个菜单可增删改查，表单预览可填单，用户 / 角色 / 菜单 / 系统配置的高危写操作全部收回，避免演示者把系统改成登录不了或菜单打不开。

## 已验证的链路

本仓库部署方案在本机做过一次完整验证，以下都实际跑通：

- `docker compose build server web` 两个 target 均构建成功
- 空库首次启动：自动执行 `Init` 迁移建出 21 张表（含 `migrations` 表）→ 幂等种子创建超管 `admin` 与 57 条菜单
- 经 `web` 容器 8092 端口访问：`/` 打开管理后台、`/api/health` 返回 `{"code":0,"message":"ok"}`、`/api/admin/*` 带令牌正常返回数据
- 上传落卷并回读：`POST /api/admin/upload` 写进 uploads 卷，`GET /uploads/<文件>` 通过 nginx 正常返回
- 静态资源 `Cache-Control: immutable`、`index.html` 走 `no-cache`，`/some/deep/route` 回退到 `index.html`

## 日常运维

```bash
bash scripts/deploy.sh status     # 容器状态 + 健康检查
bash scripts/deploy.sh logs       # 跟踪 db/server/web 日志
bash scripts/deploy.sh restart    # 只重启，不重新构建
bash scripts/deploy.sh backup     # 数据库导出到 backups/
bash scripts/deploy.sh migrate    # 手动执行未跑的迁移
bash scripts/deploy.sh down       # 停止容器（保留数据卷）
```

发版（更新代码）：

```bash
bash scripts/deploy.sh backup
bash scripts/deploy.sh up --pull   # 工作区有未提交改动时会拒绝 pull
```

只想用新镜像不重新构建：`bash scripts/deploy.sh restart`；
已构建过、只想重启编排：`bash scripts/deploy.sh up --no-build`。

清缓存重新部署（构建缓存导致依赖/产物没刷新时用）：

```bash
# 跳过 Docker 构建缓存，从拉依赖开始全量重新构建再起服务
bash scripts/deploy.sh up --no-cache

# 顺手清掉悬空镜像与构建缓存（不动运行中容器、不动数据卷）
docker image prune -f
docker builder prune -f
```

> 注意：`down` 只停容器，**数据卷保留**；要连数据库和上传文件一起清掉重来，才需要
> `docker compose --env-file .env.production -f docker-compose.prod.yml down -v`，这会删数据，先备份。

## 备份与恢复

```bash
bash scripts/deploy.sh backup
# backups/db-20260101-120000.sql.gz

# 恢复数据库（会覆盖当前库，先停应用避免写入）
bash scripts/deploy.sh down
gunzip -c backups/db-20260101-120000.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  psql -U postgres -d admin_base

# 上传文件卷备份（脚本 backup 会打印同样命令）
docker run --rm -v admin_base_prod_uploads:/data \
  -v "$PWD/backups:/backup" alpine \
  tar czf /backup/uploads-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

## 域名与 HTTPS

同域名部署：保持 `HTTP_PORT=8092`（或改成 80），前面加 Nginx / Caddy / 云厂商负载均衡做 TLS 终止即可。
后端已 `trust proxy`，反代需要透传 `X-Forwarded-For` / `X-Forwarded-Proto`（`deploy/nginx.conf` 已写）。

前后端分域名部署：构建时传后端地址，并在 `CORS_ORIGIN` 填前端域名。

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build \
  --build-arg VITE_API_BASE_URL=https://api.example.com/api web
```

## 常见问题

- **页面能开但接口 502**：`server` 没起来。`bash scripts/deploy.sh logs` 看是否迁移失败或数据库连接被拒。
- **启动报 `relation ... does not exist`**：生产关闭了 `synchronize`，必须跑迁移。
  首启已内置在容器 CMD；新增实体后要生成并提交迁移，见下。
- **上传 413**：调大 `deploy/nginx.conf` 的 `client_max_body_size`，保持大于 `UPLOAD_CHUNK_SIZE_MB`。
- **构建 OOM（`pnpm install` 被杀）**：加 swap 或本机构建后传镜像（见下）。
- **拉镜像慢**：给 Docker 配镜像加速（如 `docker.m.daocloud.io`），或改用国内 registry 前缀。
- **时间差 8 小时**：容器已设 `TZ=Asia/Shanghai`；前端展示仍要按规范走 `utils/datetime.ts`。

## 本机构建、服务器只跑镜像

服务器内存小或不想装构建依赖时，可以在开发机构建后传过去（镜像名由 compose 项目名派生）：

```bash
# 开发机
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker save admin-base-prod-server admin-base-prod-web | gzip > images.tar.gz
scp images.tar.gz user@server:~/

# 服务器
gunzip -c images.tar.gz | docker load
bash scripts/deploy.sh up --no-build
```

## 新增实体后的迁移

生产 `synchronize: false`，实体改了必须配套迁移，否则新表/新列不会出现：

```bash
cd server
NODE_ENV=production DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres \
DB_PASSWORD=*** DB_DATABASE=admin_base \
pnpm exec tsx ./node_modules/typeorm/cli.js migration:generate src/db/migrations/<名字> -d src/db/data-source.ts
```

生成后 `bash scripts/deploy.sh migrate`（或直接发版，容器启动会自动跑）。
首个 `Init` 迁移已随仓库提供，覆盖框架表与现有业务表。
