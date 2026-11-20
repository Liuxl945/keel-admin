# AGENTS.md —— AI 协作规则契约

> 本文件不是技术文档、不是产品需求、也不是源码注释的替代品。
> 它只回答一件事：**AI 在本仓库改代码时，哪些必须做、哪些绝对禁止**。
> 技术栈、目录、启动与上线步骤见 `README.md`；模块实现细节见 `docs/`（§8）；代码行为以源码为准。
> 优先级：用户当轮明确指令 > 本文件 > `docs/` > `README.md`。

## 1. 协作铁律

1. 改代码前必须先读对应 docs（§8），禁止凭记忆猜实现。
2. 每阶段结束必须 `pnpm -r typecheck && pnpm -r build` 零错误；涉及页面要手动点一遍，编译通过不算完成。
3. 禁止一次生成大量文件，按模块推进、写完自测。
4. 禁止引入技术栈外依赖；确需引入先说明理由并等确认。
5. 禁止留 TODO / 半成品；做不到就明确说明放到下一阶段。
6. 注释只写「为什么」，禁止复述代码在做什么。
7. 需要用户手动操作的步骤，完成后必须给出可执行说明。
8. 禁止在没有实际执行的情况下声称「已验证 / 已通过」。
9. 禁止为未确定的业务预置数据表或提前抽象，基座保持薄。
10. 往本文件加内容只能是**一条规则一句话**，禁止写实现说明、背景、示例代码。

## 2. 后端契约（server/）

1. 响应必须 `ok()` / `pageData()`，禁止手写信封；业务失败一律 HTTP 200 + 业务 code。
2. 错误必须 `throw new AppError(ERROR_CODES.X, msg)`，禁止裸写数字码；禁止 controller 里 `res.status().json()`。
3. async controller 必须 `asyncHandler()` 包裹；事务在 service 内用 `AppDataSource.transaction`，禁止散落 try/catch。
4. `authRequired → operationLogger` 顺序固定；所有 `/api/admin/**` 必须挂 `hasPerm()`，禁止只挂登录校验。
5. Admin 与 App 令牌 audience 不可互用；刷新令牌时必须重查账号状态。
6. 实体继承 `BaseEntity`；属性名、表名、`@Column.name`、关系列一律 snake_case，驼峰只存在于 API 与前端。
7. 排序字段必须白名单映射，禁止把前端入参拼进 `orderBy` / SQL。
8. 分页只能复用 `utils/pagination.ts`（上限 200），禁止自写 `page / pageSize` 解析。
9. 禁止方言独有 SQL；生产 `synchronize: false`，首个迁移之后任何实体变更必须配 migration。
10. 判空必须 `IsNull()`；`.create / .insert` 拼错键会静默丢字段，改实体属性名后必须全量扫这些调用。
11. 上传只能走 `uploadFile()`（分片 / 续传 / 重试已封装），禁止自拼 FormData、禁止绕过 `StorageProvider` 直接写盘。
12. 枚举必须走字典 + `DictTag`，禁止页面里写死中文映射。
13. 框架能力只加在 `modules/`，代码生成产物只进 `biz/`，两处不要混放。

## 3. 数据与安全红线

1. 密码哈希、token、openid、session_key、隐私字段不得出现在日志、错误响应、App 响应；App 只显式挑字段返回。
2. 操作日志落库前必须脱敏 + 截断；新增「删日志表」接口必须加入 `SELF_AUDIT_EXEMPT_PATHS`。
3. DDL 只执行服务端生成语句并做标识符白名单；禁止透传任意 SQL；破坏性变更必须二次确认。
4. 数据接口 SQL 只能：单语句、无注释、无 DDL / 元数据探测 / 延时 / 文件读写关键字；表和列走白名单；值全部参数绑定。
5. 富文本必须 sanitize，禁止 `v-html` 用户输入。
6. `system_configs` 禁止整表透给 App，只暴露 `PUBLIC_CONFIG_KEYS`。
7. 验证码接口禁止返回明文验证码；一次性、过期、限流语义不得放宽。
8. 代码生成只返回文件内容，禁止写服务器磁盘。

## 4. 权限契约

1. 权限标识严格两段式 `模块:动作`，模块名不得再带冒号；前后端正则必须同步修改。
2. 禁止 `role === 'ADMIN'` 之类硬编码判断，一律走权限标识。
3. 菜单只由后端下发，禁止前端硬编码菜单或路由。
4. 建菜单必须同时授权 `system_admin`，否则除超管外无人可见。
5. seed 必须幂等，不得覆盖已有密码与已修改的配置。

## 5. 前端契约（admin/）

1. 列表页必须用 `ProTable`（`searchItems` / `columns` / `sortable:"custom"` / 序号列 / 勾选列 + `#toolbar`），禁止手写 el-table 组合。
2. 弹窗必须 `AppDialog`，整页内容型用 `BasicDialog`；禁止直接写 `el-dialog` / `el-drawer`。
3. 滚动区域必须 `el-scrollbar`，禁止裸写 `overflow-y: auto`。
4. 时间必须走 `utils/datetime.ts`，禁止 `replace('T',' ').slice()` 之类的字符串截取。
5. 请求必须走 `src/api/`，禁止组件里直接 axios / fetch；返回已是 data，禁止再解 `res.data.data`。
6. 接口类型必须在 `src/types/` 定义，禁止用 `any` 兜业务数据。
7. 按钮权限必须 `v-permission`。
8. 页面必须 `defineOptions({ name })` 且符合路径推导规则，否则不会被 keep-alive 缓存。
9. 颜色必须用 `var(--el-*)`，禁止写死色值。
10. 新增页面必须同时提供 api 函数、types 定义、菜单 / 权限种子与动态路由组件路径。
11. 单文件禁止超过 2000 行；逼近上限必须按领域拆分，禁止直接续写。

## 6. App 契约（app/）

1. 禁止 `uni.showToast` / `uni.showModal`；必须 `@/utils/toast`、`@/utils/modal`，页面挂 `<app-toast/>` / `<app-modal/>`。
2. 禁止前端传 openid；只 `wx.login` → 后端 code2session；`session_key` 不落库、不出服务端。
3. 老年项目尺寸是下限不是建议：正文 ≥32rpx、标题 ≥40rpx、按钮 ≥40rpx 加粗、可点区 ≥88rpx、输入 ≥88rpx / 36rpx、底部主按钮 ≥96rpx；禁止隐式手势（长按 / 左滑 / 双击）；尺寸只从 `elderly.scss` 取。

## 7. 交付前自检（逐条确认，不通过就不算完成）

- [ ] 读过对应 docs，没有凭记忆改实现
- [ ] `pnpm -r typecheck && pnpm -r build` 通过，涉及页面手点过
- [ ] 新接口有 AppError + asyncHandler + hasPerm，写操作会被日志记录
- [ ] 新页面是 ProTable + AppDialog，单文件 < 2000 行
- [ ] 没有新增依赖、没有 TODO、没有硬编码角色 / 颜色 / 中文枚举
- [ ] 改了接口 / 字段 / 常量时，docs 同一提交同步更新

## 8. 明细文档（按需读，禁止一次全读）

| 文件 | 内容 | 何时读 |
| --- | --- | --- |
| `docs/backend-features.md` | 错误码分段、RBAC 数据模型与权限清单、令牌接口、多库与 Docker、分片上传接口表、日志脱敏规则、验证码 / 字典 / Excel / 文件 / 公告 / 监控、新增模块流程 | 动认证、上传、日志、导出、RBAC 或新增业务模块时 |
| `docs/dev-form.md` | 表单设计器目录与领域模型、`schema_json` 全字段、主从表与子表、在线预览、代码生成模板 | 改 `views/dev/form`、`modules/dev-form`、`components/form-controls`、生成业务页面时 |
| `docs/dev-data.md` | 数据连接（加密 / 同步 / 默认连接）、数据建模（字段 / DDL）、数据接口（`config_json` / SQL 模板 / 试运行） | 改 `dev-data-source` / `dev-model` / `dev-api` 时 |
| `docs/admin-ui.md` | ProTable 列细节、AppDialog + BasicDialog 的 padding / 遮罩实现、多页签与主题实现 | 改公共组件与布局时 |
| `docs/lowcode-platform-plan.md` | 在线开发能力规划、缺口清单、路线图、技术决策（SQL 安全边界） | 规划在线开发下一阶段时 |
| `README.md` | 技术栈、目录速览、启动 / 命令 / 上线检查 | 需要环境或启动信息时 |
