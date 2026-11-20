# Keel（龙骨）

一个可以直接拿来写业务的全栈后台基座，同时内置了一套「在线开发」能力：数据连接、数据建模、数据接口、表单设计，配好表就能生成可用的 CRUD 页面和前后端代码。

名字取「龙骨」：船的脊梁，所有结构都围着它造。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org)
[![Vue](https://img.shields.io/badge/vue-3-42b883)](https://vuejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-f69220)](https://pnpm.io)

- 在线演示：<http://8.148.233.130:8092/>
- 演示账号：`demo` / `Demo@123456`（登录页可一键填入）
- 演示环境收回了用户、角色、菜单、系统配置的高危写权限，其余功能均可操作

## 这个项目是什么

大多数后台项目的前两个月都在重复做同一件事：登录、权限、菜单、字典、日志、上传、导出、表格页、弹窗表单。这部分代码写多少遍都差不多，但每次都要重写一遍，而且写歪了后面很难改。

这个仓库把这些能力做成一个可复用的基座，并且用一套明确的工程契约把它们约束住：

- 响应信封、错误码、分页、鉴权、权限校验、操作日志都有统一入口，业务代码只写业务；
- 列表页、弹窗、时间格式化、枚举展示都有公共组件，不允许各写一套；
- 新增一个模块 = 实体 + service + controller + route + api + 页面 + 菜单权限种子，结构固定。

在这之上，加了一层低代码：先把数据库表接进来，再用表单设计器决定「哪些字段进表单、哪些进列表、哪些做查询条件」，最后在线预览、按需生成代码。它不是要替代写代码，而是把「建表 → 写 CRUD → 配菜单权限」这段最机械的流程压缩掉。

## 在线开发能做什么

### 数据连接

支持 MySQL / PostgreSQL，密码用 AES-256-GCM 加密存储，接口只返回 `hasPassword`，不返回明文密文。连接测试通过后自动同步库表元数据（表名、注释、字段、类型、主键），可设置默认连接，后续建模、导入、表单设计默认选中它。

### 数据建模

新建模型只填名称、编码和连接，表名与字段在建模器里配置。字段只描述数据库结构，不在这里决定表单长什么样。首次发布执行 `CREATE TABLE`；已发布模型再次编辑会回到草稿，重新发布时对比数据库当前结构生成差异 `ALTER TABLE`，发布前展示完整 SQL 和风险项（删字段、改类型、改非空、表重命名），二次确认后才执行。

已有表也可以直接导入：要求 `id` 主键和 `created_at / updated_at / deleted_at` 三个标准字段，类型能映射到内部支持的类型，系统表（`sys_` / `dev_`）拒绝导入。

### 数据接口

两种类型：

- 静态数据：直接写 JSON，同样支持分页、字段映射、只输出映射字段；
- SQL：选连接、选模型，动作四选一（查询 / 新增 / 修改 / 删除），SQL 用 `:name` 命名参数，服务端替换为 `?` / `$1` 绑定，值绝不拼进语句。

SQL 的安全边界是硬约束：单条语句、禁止注释与 DDL、语句首关键字必须和动作一致、表名和列名必须在已同步业务表白名单里、未声明的参数在 DTO 层就拒绝、数据库错误截断后返回。试运行会返回绑定后的 SQL、结果行、耗时，方便在页面里直接调试。

### 表单设计

三步：

1. 基础设计：选数据连接、主表、可选的从表（一对多明细，通过「外键字段 → 主表主键」声明关系）；
2. 表单设计：从控件库拖控件，24 栅格排版，右侧属性面板分「组件属性 / 组件样式 / 表单属性」，支持必填、禁用、占位、数值范围、选项、标题宽度、控件宽度、标签位置、弹窗形态（居中 / 右侧抽屉 / 全屏）；
3. 列表设计：分别配置查询字段和列表字段，条件类型、默认值、排序、冻结、对齐、宽度都可以调。有子表时可选「合并到列表」或「展开行」，合并模式会把主表单元格按明细行数跨行合并。

完成后的页面是真实可用的：预览会直接读写目标表，支持分页、排序、多选、批量删除，新增/编辑/查看弹窗按设计渲染，子表明细随主表同事务提交。确认无误后导出代码：

```text
server/src/biz/<formKey>/        entity / dto / service / controller / route / README
admin/src/views/biz/<formKey>/   index.vue / api.ts
```

`server/src/biz/index.ts` 启动时自动扫描并注册实体与路由，前端页面由 `views/**/*.vue` 的 glob 自动收集，放进目录、配好菜单权限就能访问。代码生成只返回文件内容，不会写服务器磁盘。

## 基座能力

| 分类 | 内容 |
| --- | --- |
| 认证 | 账号密码登录、图形验证码、access / refresh 双令牌、静默刷新、Admin 与 App 令牌 audience 隔离 |
| 权限 | 角色 / 菜单 / 按钮三级 RBAC，权限标识 `模块:动作`，菜单由后端下发并注入动态路由，前端 `v-permission` |
| 系统 | 用户、角色、菜单、字典、公告、文件、系统配置、操作日志（落库前脱敏 + 截断）、服务监控、个人中心 |
| 组件 | ProTable、AppDialog / BasicDialog、DictTag、UploadImage、分片上传（续传 / 重试）、Excel 导入导出 |
| 体验 | 多页签、keep-alive 缓存、主题色、暗色模式 |
| App | uni-app Vue3 适老化模板，微信 `code2session` 登录，`session_key` 不落库 |

## 技术栈

| 端 | 技术 |
| --- | --- |
| server | Node.js、Express、TypeORM、PostgreSQL（可切 MySQL / SQLite）、JWT、zod、Docker |
| admin | Vue 3、TypeScript、Vite、Element Plus、Pinia、Vue Router |
| app | uni-app、Vue 3、TypeScript、Vite |
| 工程 | pnpm workspace、Docker Compose、Nginx |

## 架构

```text
                     ┌──────────────────────────┐
   admin (Vue3) ────▶│ nginx / Vite proxy       │
   app  (uni-app) ──▶│   /api  /uploads         │
                     └────────────┬─────────────┘
                                  ▼
                     ┌──────────────────────────┐
                     │ server (Express)         │
                     │  auth → perm → log → ctrl│
                     │  modules/  框架能力      │
                     │  biz/      生成业务模块  │
                     └───────┬──────────┬───────┘
                             ▼          ▼
                  ┌──────────────┐  ┌──────────────┐
                  │ PostgreSQL   │  │ uploads 卷   │
                  └──────────────┘  └──────────────┘
```

在线开发的数据连接是独立于主库的动态连接，用 `mysql2` / `pg` 客户端直连目标库，不挂到 TypeORM 的 DataSource 上。

## 快速开始

环境：Node.js 20+、pnpm（版本以 `package.json` 的 `packageManager` 为准）、Docker Desktop（默认用 Docker 起 PostgreSQL）。

```bash
pnpm install
pnpm db:up        # 启动 PostgreSQL 容器
pnpm dev:server   # 后端，http://localhost:3000
pnpm dev:admin    # 管理后台，http://localhost:5173
pnpm dev:app      # App H5，http://localhost:5174
```

首次启动会自动建表并写入幂等种子：超管账号、菜单权限、字典，以及在线开发的演示数据。

默认超管：`admin / KEEL@123456`（`SEED_ADMIN_PASSWORD` 可改，仅空库首次创建时生效）。
演示账号：`demo / Demo@123456`（`SEED_DEMO_PASSWORD`）。

只想连外部数据库时跳过 Docker：

```bash
cp server/.env.example server/.env
SKIP_DB=1 pnpm dev:server
```

常用命令：

```bash
pnpm typecheck   # 三端类型检查
pnpm build       # 三端构建
pnpm seed        # 手动执行幂等种子（新增菜单权限后执行）
pnpm db:reset    # 删除数据库容器与数据卷（需确认）
```

## 常见问题

**端口 3000 被占用**：改 `server/.env` 的 `PORT`，同时把 `admin/vite.config.ts`、`app/vite.config.ts` 的代理 target 改成同一端口，`VITE_API_BASE_URL` 仍保持 `/api`。

**5432 被占用**：改根目录 `.env` 的 `POSTGRES_PORT` 和 `server/.env` 的 `DB_PORT`，保持一致后重新 `pnpm db:up`。

**Docker 没启动**：先启动 Docker Desktop；只想连外部数据库时用 `SKIP_DB=1 pnpm dev:server`。

**想重置数据**：`pnpm db:reset` 删除容器与数据卷，再 `pnpm db:up`，空库会自动建表并写种子。

**新增菜单后侧边栏没变化**：`pnpm seed` 后重新登录。

**切到 SQLite**：`server/.env` 设 `DB_TYPE=sqlite`、`DB_SQLITE_PATH=data/dev.sqlite`，用 `SKIP_DB=1` 启动。

## 目录结构

```text
server/src
├── config/        环境变量校验
├── db/            DataSource、实体、迁移、seed
├── middlewares/   鉴权、权限、校验、错误处理、操作日志
├── modules/       auth / user / role / menu / dict / notice / file / monitor /
│                  profile / config / log / upload / captcha /
│                  dev-form / dev-data-source / dev-db-table / dev-api
├── biz/           生成的业务模块（自动注册）
└── utils/         响应、分页、JWT、密码、日志、限流、Excel、加密

admin/src
├── api/           接口封装
├── components/    ProTable、AppDialog、BasicDialog、DictTag、form-controls
├── layout/        侧边栏、顶栏、多页签、界面设置
├── router/        静态路由 + 菜单动态注入
├── stores/        user / app / dict / settings / tagsView
└── views/         login / dashboard / system / dev / biz

app/src            登录、首页、toast / modal、适老化样式
```

## 文档

| 文件 | 内容 |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | 代码契约：响应格式、错误码、权限、实体命名、前端组件、交付自检 |
| [docs/backend-features.md](./docs/backend-features.md) | 错误码、RBAC、令牌、上传、日志脱敏、字典、Excel、监控 |
| [docs/dev-form.md](./docs/dev-form.md) | 表单设计器领域模型、`schema_json` 全字段、主从表、预览、代码生成 |
| [docs/dev-data.md](./docs/dev-data.md) | 数据连接、建模与 DDL 差异发布、数据接口配置与 SQL 安全边界 |
| [docs/admin-ui.md](./docs/admin-ui.md) | ProTable 列细节、AppDialog / BasicDialog、主题与页签 |
| [docs/deploy.md](./docs/deploy.md) | Docker Compose 部署拓扑、环境变量、备份恢复、HTTPS |
| [docs/lowcode-platform-plan.md](./docs/lowcode-platform-plan.md) | 低代码路线图、缺口清单与技术决策 |
| [docs/blog/keel-intro.md](./docs/blog/keel-intro.md) | 掘金文章：前端转全栈，为什么做这个基座 |

## 部署

生产用 `docker-compose.prod.yml` 起 db + server + web，宿主机不用装 Node / pnpm：

```bash
bash scripts/deploy.sh up   # 首次会先生成 .env.production 并退出，确认后再执行一次
```

管理后台默认 8092 端口，数据库与上传文件在命名卷里，`down` 不丢数据。拓扑、备份、HTTPS、本机构建传镜像见 [docs/deploy.md](./docs/deploy.md)。

## 已知边界

- 数据接口目前只做配置管理与在线调试，按接口编码对外开放调用的运行时 API 留待下一阶段；
- 数据建模只支持 `varchar / text / int / decimal / boolean / date / datetime` 七种字段类型；
- 代码生成的复杂字段（精确 decimal、联合查询等）需要在生成结果上手工调整；
- 生成代码不会自动落盘，需要 review 后手动接入。

## License

[MIT](./LICENSE)
