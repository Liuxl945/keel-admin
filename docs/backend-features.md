# 后端功能模块 —— 完整规格

> 后端功能模块、错误码、RBAC 数据模型、新增模块流程的完整说明。契约条目见 `CLAUDE.md`。
> 动认证 / 上传 / 日志 / 导出 / RBAC / 系统功能，或新增业务模块时读本文件。

## Token 自动刷新（Admin + App）

- 访问令牌默认 1h，刷新令牌 7d，环境变量 `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`。
- **两个 audience 不可复用**：Admin 令牌 `aud=admin`，App 令牌 `aud=app`。
  Admin 路由只认 admin 令牌，App 路由只认 app 令牌，错误 code 统一 40302。
- 接口：
  - Admin：`/api/auth/admin/login`、`/api/auth/admin/refresh`、`/api/auth/admin/me`
  - App：`/api/auth/app/login`（微信 code）、`/api/auth/app/refresh`、`/api/auth/app/me`
- 服务端刷新时**必须重查账号状态**，被禁用（40301）或 audience 不匹配（40302）拒签。
- 前端：Admin 在 `admin/src/api/request.ts`、App 在 `app/src/api/request.ts`
  统一做 401xx 静默刷新 + 单例 refreshPromise + 透明重发；
  用 `_skipRefresh` 标记防止 login / refresh 被二次拦截。
- 两端同时持久化 `accessToken / refreshToken`，登出与会话失效同时摘除二者。

## 多数据库 & 自动建表

`server/src/db/data-source.ts` 根据 `DB_TYPE` 返回不同配置：

- `postgres`（**默认**，Docker Compose 启动，端口 5432）
- `mysql`（可选，端口 3306）
- `sqlite`（仅本地快速试用，better-sqlite3）

数据库启动：

- `pnpm db:up`：`docker compose up -d postgres` 并等待 `pg_isready`；首次自动创建
  `admin_base` 库，数据保存在 Docker 卷 `admin_base_pgdata`。
- `pnpm dev:server` 会**默认先拉起数据库**再启动后端；使用外部数据库或 SQLite 时用
  `SKIP_DB=1 pnpm dev:server`。
- `pnpm db:down` 停止容器（保留数据）；`pnpm db:reset` 删除数据卷（需确认）；
  `pnpm db:logs` 查看日志；`pnpm db:shell` 进入 psql。
- Docker 默认账号 `postgres / postgres`、库 `admin_base` **仅限开发**，生产必须改。

规则：

- 开发环境 `synchronize: true` 仅用于早期试错；**生产环境必须 `synchronize: false`**。
- 首个全量迁移生成后，任何实体变更必须配套新 migration 并在空库验证。
- 迁移与查询**禁止使用方言独有特性**（MySQL JSON 函数、PostgreSQL 数组等），保证三库可跑。
- 实体 `@Column` 要写 `comment`（SQLite 会忽略，MySQL/PG 生效）。

## 文件上传

**统一走分片上传**（`admin/src/api/upload.ts` 内部完成，调用方仍然只传 `File`）：

| 步骤 | 接口 | 说明 |
| --- | --- | --- |
| 初始化 | `POST /api/admin/upload/chunk/init` | body `{ fileKey, fileName, fileSize, mimeType, chunkSize? }`，返回 `{ uploadId, chunkSize, totalChunks, uploaded[] }`；`uploaded` 是服务端已收到的分片，用于续传 |
| 传分片 | `POST /api/admin/upload/chunk/:uploadId/part` | multipart `chunk`（二进制）+ `index`（序号），单请求只允许一片 |
| 合并 | `POST /api/admin/upload/chunk/:uploadId/complete` | 合并分片、校验总大小、落盘、写 `uploaded_files`，返回 `{ id, url, name, size, mimeType }` |
| 查进度 | `GET /api/admin/upload/chunk/:uploadId` | 同 init 的返回体，页面刷新后可查已传分片 |
| 取消 | `DELETE /api/admin/upload/chunk/:uploadId` | 清掉临时分片 |

- **断点续传**：`uploadId` 由客户端指纹（`名称|大小|最后修改时间|MIME` 的 SHA-256）派生，
  同一文件重新发起 init 会命中同一会话并返回 `uploaded`，前端跳过已传分片；
  文件被改写（同名但体积变化）时服务端重建会话，不会拼出脏文件。
- **分片重试**：单片失败按 400/800/1200ms 退避重试 3 次，不会让整个文件从头再来；
  分片请求带 `_silent`，避免每次重试都弹全局错误，最终失败由上传控件提示。
- **临时分片**放在 `UPLOAD_DIR/.chunks/<uploadId>/`（dotfiles 目录，`express.static` 默认不对外），
  合并成功后立即删除；未完成会话保留 24 小时，init 时惰性清理。
- 合并用流式追加（`pipeline` + `append`），落盘走 `StorageProvider.saveFromPath` 直接 move 临时文件，
  大文件不整体进内存（实测 120MB / 24 片 md5 与源文件一致）。
- 配置：`UPLOAD_CHUNK_SIZE_MB`（分片大小，默认 5）、`UPLOAD_MAX_FILE_SIZE_MB`（单文件上限，默认 2048）；
  旧的 `UPLOAD_MAX_SIZE_MB` 只约束遗留的整文件接口 `POST /api/admin/upload`（字段 `file`，保留给脚本直传）。
- 类型白名单集中在 `upload-policy.ts`（`resolveExtension` / `assertAllowedType`），
  **init 阶段就拦截**，避免白传所有分片才失败；覆盖图片/视频/音频/Office/PDF/文本/压缩包，
  mime 未命中（如 Office 常报 `application/octet-stream`）按扩展名兜底，排除 html/js/svg/exe 等风险类型。
- 前端使用方式：`uploadFile(file, { onProgress })`；`useUploadControl` 把进度透传给 `el-upload` 渲染百分比，
  上传失败统一 `ElMessage.error(message)`（分片请求静默，避免重复提示）。

## 登录验证码

- 获取：`GET /api/auth/captcha`（公开），返回 `{ captchaId, image, expiresIn }`；
  `image` 为 base64 SVG，**接口绝不返回明文验证码**。
- 校验：`POST /api/auth/admin/login` 必须携带 `captchaId + captchaCode`；
  验证码**一次性使用**（校验即作废），默认 5 分钟过期，错误码 `40004`。
- 验证码失败同样计入登录失败限流，并写 `login_logs`（原因「验证码错误或已过期」）。
- 存储当前为进程内 Map（上限 5000、过期清扫）；**多实例部署必须换成 Redis**。
- 前端登录失败后自动刷新验证码并清空输入；点击验证码图片可手动刷新。
- App 端微信登录不经过账号密码，不需要验证码。

## 字典管理

- 表结构：`sys_dict_types`（`dict_name / dict_type / status / remark`）+
  `sys_dict_data`（`dict_type / dict_label / dict_value / dict_sort / tag_type / status / remark`）。
- 业务枚举（状态、公告类型、菜单类型等）**一律走字典**，禁止在页面里散落 `ENABLED ? '启用' : '禁用'`。
- 前端用 `<DictTag type="sys_normal_disable" :value="row.status" />` 渲染标签；
  字典数据由 `stores/dict.ts` 统一加载一次（60 秒服务端缓存，写操作立即失效）。
- 内置字典在 `seed-data.ts` 的 `DICT_SEED`：`sys_normal_disable`、`sys_notice_type`、
  `sys_notice_status`、`sys_menu_type`。
- 新增枚举：后台「字典管理」建类型 + 数据即可，不需要改代码；业务前端直接用 DictTag。

## 文件管理

- 上传成功会写 `uploaded_files`（落盘名、原始名、URL、大小、MIME、上传人），
  后台「文件管理」页可查询、预览、复制链接、删除。
- `StorageProvider` 同时提供 `save / saveFromPath / remove`；删除先删磁盘再删记录，文件已缺失视为成功。
- 前端统一用 `components/UploadImage` 或 `api/upload.ts`，禁止组件里直接写 `uni`/`fetch` 上传；
  `api/upload.ts` 已封装分片、重试与断点续传，业务侧不要再拼 FormData 直传。

## Excel 导入导出

- 服务端统一 `utils/excel.ts`：`buildExcelBuffer / parseExcelBuffer / sendExcel`。
- 导出接口返回二进制文件（GET），前端用 `downloadFile()`；失败时后端仍是 JSON 信封，
  `downloadFile` 会解析并提示。
- 用户导入语义：逐行处理、失败不中断，返回 `{ total, success, skipped, errors }`；
  账号已存在计为 `skipped`，单次最多 1000 条。
- 已内置：用户导出/导入/模板、操作日志导出、登录日志导出。

## 个人中心

- `/api/admin/profile`：`GET` 资料、`PUT` 修改昵称/头像/邮箱/手机号、
  `PUT /password` 校验原密码后改密。
- 改密成功后前端主动清会话并跳登录页；JWT 无状态，旧令牌在过期前仍有效，
  如需强制失效需给用户加 `token_version` 并在鉴权时比对。

## 通知公告

- `sys_notices`：标题、类型、纯文本正文、状态（`DRAFT/PUBLISHED/CLOSED`）、发布人快照、发布时间。
- 发布时写入发布人与时间；关闭只改状态，不删除历史。
- 当前正文是纯文本（保留换行），如需富文本必须同时接入 HTML sanitize，禁止直接 `v-html` 用户输入。

## 服务监控

- `GET /api/admin/monitor/server`（权限 `monitor:server`）返回 CPU 负载、内存、磁盘、
  进程内存、Node/系统信息、数据库连通状态。
- 前端每 10 秒自动刷新；磁盘通过 `fs.statfs` 获取，不依赖 `df` 命令。

## 操作日志脱敏与截断（实现细节）

- 采集点只有一个：`middlewares/operation-logger.ts`，挂在 adminRouter 鉴权之后，**只记写操作**
  （POST/PUT/PATCH/DELETE）。在 `app.ts` 装配 adminRouter 时顺序不能调换。
- 采集内容：HTTP 方法/路径/状态码/业务 code/耗时/IP/UA + 查询参数 + 请求体 + 响应信封。
- 脱敏（`modules/log/log-payload.ts`）：
  - 键名命中 `/pass(word)?|pwd|token|secret|credential|authorization|cookie|openid|session_key/i`
    → 值替换 `***`，递归覆盖嵌套对象与数组；
  - 超 4000 字符截断并追加「…（内容已截断）」；
  - multipart 请求只落一句说明，不解析二进制；
  - 序列化失败（循环引用等）不抛异常，落到字符串占位。
- 接口：`GET /api/admin/logs/operation-logs`（列表不带 payload）、
  `GET /api/admin/logs/operation-logs/:id`（详情）、
  `POST /api/admin/logs/{operation-logs,login-logs}/batch-delete`（`{ ids }` 上限 200，宽容语义），
  统一挂 `system:log` 权限。
- **记录不可改、但可清理**；清理动作不进日志表（`SELF_AUDIT_EXEMPT_PATHS` 排除 batch-delete 路径，
  改记 pino），新增「删日志表本身」的接口必须加入该集合。
- 登录成功/失败都要写 `login_logs`（账号、IP、UA、结果、原因）。

## 初始化数据（seed）细节

- 超管账号：`admin`（密码取 `SEED_ADMIN_PASSWORD`，默认 `KEEL@123456`），
  首次启动库为空时自动创建，也可 `pnpm seed` 手动执行。
- 内置角色：`system_admin`（系统管理员，全部菜单）、`viewer`（查看员，只读列表权限）、
  `demo`（演示账户，除用户/角色/菜单/系统配置外全部放开，菜单每次启动按此规则重算）。
- seed **必须幂等**：按 `perm / path / code / key` upsert，重复执行不产生重复数据，
  且不覆盖已有密码与已修改的配置值。
- 新增菜单/权限：改 `server/src/db/seed-data.ts` 后重新执行 seed，`system_admin` 会自动补全新菜单。
- 表单设计「生成菜单」会同时授权 `system_admin` 与 `demo`，演示账号无需再手工勾选即可访问新页面。

## 错误码分段（`server/src/utils/app-error.ts`）

| 段 | 含义 | 已使用示例 |
| --- | --- | --- |
| `0` | 成功 | |
| `400xx` | 参数 / 业务校验 | 40001 参数校验失败、40002 账号或密码错误、40004 验证码错误/过期 |
| `401xx` | 未登录 / token 失效 | 40101 未登录、40102 刷新令牌无效 |
| `403xx` | 无权限 / 身份不匹配 | 40301 账号禁用、40302 audience 不匹配、40310 无权限 |
| `404xx` | 资源不存在 | 40401 |
| `429xx` | 限流 | 42900 登录失败次数过多 |
| `500xx` | 服务端异常 | 50000 |

新增错误码必须写进 `ERROR_CODES` 常量并在业务里引用常量。`errorHandler` 是唯一出口：
`AppError` 按 code 输出；ZodError → 40001；未知异常 → 50000（日志打完整堆栈，响应体不暴露内部信息）。

## RBAC 数据模型

- `sys_users`：`username`（唯一）、`password_hash`（`select: false`）、`nickname`、
  `status`、`is_super_admin`、`last_login_at`。
- `sys_roles`：`name / code(唯一) / description / sort / status`。
- `sys_menus`：`parent_id / name / type('DIR'|'MENU'|'BUTTON'|'FORM') / form_id /
  path / component / perm / icon / sort / visible / status`。
  `type='FORM'` 表示「在线表单」菜单：只存 `form_id`，`path`（`/biz/<form_key>`）与
  `component`（`biz/runtime/index`）由服务端按绑定的已发布表单推导，禁止手填；
  同一张表单只能绑定一个菜单。
- `sys_user_roles`、`sys_role_menus`：TypeORM `@JoinTable` 生成的联合唯一关联表。

## 权限标识清单

- 格式严格为两段 `模块:动作`，全小写，动词用 `list|detail|create|update|delete|assign|verify|export`。
  **模块名本身不能再带冒号**：开发模块写 `dev_form:list`、业务表单写 `biz_ddlb:list`，
  不写 `dev:form:list` / `biz:ddlb:list`；层级用下划线连接。
  前后端正则统一为 `^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$`，改一处必须同步另一处。
- 基础层已内置：用户 / 角色 / 菜单 / 字典 / 公告 / 文件 / 配置 / 日志 / 上传 / 监控，
  完整清单见 `server/src/db/seed-data.ts`。
- 示例：`user:list` `user:export` `user:import` `role:assign` `menu:update`
  `dict:list|create|update|delete` `notice:list|create|update|delete`
  `file:list|delete` `monitor:server` `system:config` `system:log` `system:upload`
  `dev_form:list|create|update|delete|publish` `dev_ds:list|create|update|delete|test`
  `dev_model:list|create|update|delete|ddl` `dev_api:list|create|update|delete|publish|run`。
- 表单业务权限统一为 `biz_<form_key>:list|create|update|delete`：页面菜单持 `:list`，
  三个按钮菜单持 `:create/:update/:delete`。**不要写成三段式**——生成代码里的
  `v-permission="'biz_ddlb:create'"` 用的就是这套标识，在线预览页与独立生成页共用一份授权。
- 前端按钮：`v-permission="'user:create'"`，无权限移除节点（超管放行）。
- 在线预览运行时接口用 `hasFormPerm(action)` 校验 `biz_<form_key>` 命名空间，未授权时回落
  `dev_form:list` / `dev_form:update`；表单菜单的权限标识必须以 `biz_<form_key>:` 开头，否则保存报错。
- 建菜单必须同时授权：`grantMenuToDefaultRoles()` 把页面 + 按钮挂到 `code = 'system_admin'` 与
  `code = 'demo'` 的角色上（目标库没有对应角色时跳过），否则除超管外没人能在侧边栏看到、也没法调接口；`menu.sql` 末尾带同一段语句。

## 新增业务模块的标准流程

以「文章管理」为例：

1. **实体**：`server/src/db/entities/article.entity.ts`，继承 `BaseEntity`，
   全部 snake_case，`@Entity('articles')`，字段写 comment；在 `entities/index.ts` 注册。
2. **模块**：`server/src/modules/article/` 下建 `article.dto.ts`（zod）、
   `article.service.ts`（纯业务、抛 AppError）、`article.controller.ts`、`article.route.ts`。
3. **分页**：dto 复用 `pageQuerySchema / pageSizeQuerySchema`，列表返回 `pageData`。
4. **权限**：路由挂 `hasPerm('article:list')` 等；所有写操作自动被 operationLogger 记录。
5. **挂载**：`app.ts` 的 adminRouter 下 `adminRouter.use('/articles', articleRouter)`。
6. **菜单种子**：`seed-data.ts` 增加菜单与按钮权限，重跑 `pnpm seed`；
   状态类枚举优先在 `DICT_SEED` 加字典，前端用 `DictTag` 而不是写死文案。
7. **前端**：`admin/src/api/article.ts`、`types/article.ts`、
   `views/article/index.vue`（必须 ProTable + AppDialog）、
   组件路径 `article/index` 必须与菜单 `component` 一致。
   新增页面后重启一次 Vite，`import.meta.glob` 才会收录新的视图文件。
8. **验证**：`pnpm -r typecheck && pnpm -r build`，再手工跑一遍增删改查与权限。
9. **迁移**：首次全量迁移生成后，实体变更必须补 migration，禁止再依赖 synchronize 维护真实库。

> 由「代码生成」产出的模块走 biz 目录，省掉第 1、2、5 步：
> 后端放 `server/src/biz/article/`（`article.entity.ts` + `article.route.ts` 会被启动扫描自动注册），
> 前端放 `admin/src/views/biz/article/`；分层、权限、日志等其余规范不变。
