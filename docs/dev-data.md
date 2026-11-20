# 数据连接 / 数据建模 / 数据接口 —— 完整规格

> 数据连接 / 数据建模 / 数据接口的完整实现规格。契约条目见 `CLAUDE.md`（§8 索引）。
> 改 `dev-data-source` / `dev-model` / `dev-api` 模块时必读。

## 数据连接 / 数据建模

- 仅支持 **MySQL / PostgreSQL**；数据连接是动态连接，使用 `mysql2` / `pg` 客户端，
  不走固定 TypeORM DataSource。
- 表 `dev_data_sources`：连接名称/编码/类型/主机/端口/库名/用户名/加密密码/状态/是否默认/最近测试。
  **密码使用 AES-256-GCM 加密存储**，密钥取 `DATA_SOURCE_SECRET`（未配置时回退 `JWT_SECRET`）；
  接口只返回 `hasPassword`，绝不返回明文或密文。轮换密钥会导致旧密码无法解密，需重新保存。
- **默认连接**：有连接时保证恰好一个 `is_default = true`；第一条连接自动成为默认，
  设置新默认会清除旧默认，删除默认连接会自动把默认转给下一条。老库没有默认时启动自动补一条。
  表单设计、新建模型、从数据库导入等所有连接下拉默认选中它；`/options` 默认项排在最前。
- 接口：`/api/admin/dev/data-sources`（CRUD、`/:id/test`、`/:id/tables`、`/:id/sync-tables`），
  权限 `dev_ds:*`；被模型引用的连接不能删除，删除连接时同步清理该连接的库表元数据。
- **连接成功后自动同步库表**：`/:id/test` 测试通过后会调用同步逻辑，把表名/注释/字段元数据写入
  `dev_db_tables`；也可手动 `POST /:id/sync-tables` 或 `/api/admin/dev/db-tables/sync/:connectionId`。
- 表 `dev_db_tables`：`connection_id / table_name / table_comment / columns_json / column_count /
  synced_at`，同一连接下表名唯一。字段元数据包含原始类型、映射类型、是否可空/主键/自增、
  长度/精度、注释，供数据建模浏览和导入。
- 表 `dev_models`：模型名称/编码/数据连接/目标表名/最近发布表名/表注释/字段 JSON/状态/建表时间。
  模型编码唯一，同一连接下表名唯一。
- **导入已有表**：`POST /api/admin/dev/models/import-existing`，从 `dev_db_tables` 取字段生成
  `CREATED` 状态模型，不执行建表。兼容要求：
  - 表具备 `id` int 主键与 `created_at / updated_at / deleted_at` datetime 字段；
  - 业务字段类型可映射到 `varchar/text/int/decimal/boolean/date/datetime`；
  - `sys_` / `dev_` 等系统表禁止导入。
  不兼容时在库表列表中展示原因，导入按钮禁用。
- 字段设计（建表）只配置数据库结构：`columnName / type / length / precision / scale /
  nullable / label（说明）`，支持拖动排序；`fieldName` 由列名自动转小驼峰，不手工填写。
  - 类型仅支持 `varchar|text|int|decimal|boolean|date|datetime`；
  - 固定系统字段：`id`（主键、自增）、`created_at / updated_at / deleted_at`；
  - 列名 snake_case，代码字段名自动映射；
  - **列表、表单、搜索字段不在建表时配置**，统一在表单设计第 3 步决定（见 `docs/dev-form.md`）。
- 发布（建表/改表）：
  - 模型列表必须按 `connectionId` 查询（默认数据连接），不允许跨连接混合展示；
  - 新增模型只填名称/编码/连接，表名、表注释、字段统一在设计器设置；
  - `GET /dev/models/:id/ddl` 预览发布计划；`POST /dev/models/:id/publish` 执行（权限 `dev_model:ddl`），
    `/create-table` 保留为兼容别名；
  - 首次发布生成 `CREATE TABLE / COMMENT`；已发布模型重新编辑后状态回到 `DRAFT`，
    再次发布按数据库当前结构生成差异 `ALTER TABLE`（增删改字段、注释、表重命名）；
  - 发布前必须展示完整 SQL 与风险提示（删除字段、改类型、改非空、表重命名），
    破坏性变更二次确认后才执行；
  - **只执行服务端生成的 DDL**，标识符白名单校验，禁止透传任意 SQL；
  - 已存在同名表、新表名冲突、连接禁用、表名命中系统保留前缀（`sys_` / `dev_` 等）都会拒绝；
  - 首次发布后 `connection_id` 不可修改；`published_table_name` 用于识别表重命名。
- 代码生成：`GET /dev/models/:id/code` 返回 9 个文件，`GET /dev/models/:id/code/zip` 打包下载：
  - 后端 `server/src/biz/<modelKey>/`：entity（`decimal` 带 transformer、date 为 string、
    datetime 为 Date）/ dto / service / controller / route / `migration.sql`；
  - 前端 `admin/src/views/biz/<modelKey>/`：`index.vue`（ProTable 列表 + 新增/编辑弹窗 + 删除）+
    `api.ts`；
  - 模块目录内 `README.md` 接入说明。
- 生成代码只读下载，不会自动写入项目或再次执行 SQL；接入前必须 review。

## 数据接口（在线开发）

- 数据表 `dev_apis`：`name / api_key(唯一,snake_case) / category('STATIC'|'SQL') / description /
  connection_id / model_id / table_name / action / config_json / status / version / published_at / updated_by`。
  创建只落基本信息，配置在设计器里补齐；完整性在**保存 / 发布 / 试运行**时校验。
  已发布接口改了配置自动回到 `DRAFT`，再次发布 `version + 1`。
- 设计器从列表以 `BasicDialog` 全屏内容弹窗打开，三个 tab 对应需求里的三个分区：
  **基本信息**（名称/编码/类型/说明/关联摘要）、**数据配置**、**数据处理**；顶部有「试运行」。
  组件 `views/dev/api/index.vue`（ProTable 列表）+ `views/dev/api/designer.vue` + `components/RunDialog.vue`。
- `config_json` 结构：
  `{ staticData, sql, params:[{ key,label,type,required,defaultValue,sampleValue }],
  fieldMappings:[{ columnName,outputKey,label,hidden }],
  dataProcess:{ returnMode:'list'|'one'|'count', paging, pageSize, orderBy, orderDir, mappedOnly, maxRows } }`。
- **静态数据**：`staticData` 手写 JSON 文本（对象或数组），保存/执行时校验可解析；运行时直接返回，
  同样支持分页、字段映射、只输出映射字段、最大行数与返回形态。
- **SQL 操作**：关联「数据连接 + 建模数据」，目标表由模型带出，动作四选一
  （查询 `QUERY` / 增加 `INSERT` / 修改 `UPDATE` / 删除 `DELETE`）。
  - SQL 用**模板 + 命名参数**：条件值写 `:name`，服务端替换成 `?` / `$1` 绑定占位符并 push 到 params，
    值绝不拼进 SQL；参数表来自模板里自动提取的 `:name`（「同步参数」按钮），示例值用于试运行预填。
  - 可按动作「生成示例 SQL」；结果列下拉来自 `dev_db_tables.columns_json`（「从表字段填充」按钮）。
  - 数据处理：`returnMode` 决定列表/首条/计数；查询可开分页（服务端追加 `LIMIT/OFFSET` 并额外跑一次 COUNT，
    模板里不许再写 LIMIT）；排序字段走列白名单；`mappedOnly` 只输出映射过的字段；
    字段映射把结果列名改成业务 key，隐藏列不出现在返回里。
- **SQL 安全边界**（`dev-api.sql.ts` + `dev-api.runtime.ts`，对应规划 D1）：
  1. 单条语句、禁止注释、禁止 DDL / 元数据探测 / 延时与文件读写关键字；
  2. 语句首关键字必须与动作一致，且不允许跨动作写关键字；
  3. SQL 里 `FROM/JOIN/UPDATE/INTO` 引用的表必须在该连接**已同步的非系统业务表白名单**里；
     结果列、排序列必须在目标表字段白名单里；
  4. 值一律参数绑定，PG 用 `$n`、MySQL 用 `?`；未声明的 `:param` 在 DTO 层即被拒绝；
  5. 数据库错误压缩到 300 字符回传，不暴露连接信息与堆栈。
- 试运行 `POST /dev/apis/:id/run` 返回 `{ sql, params, rows, total, page, pageSize, returnMode,
  affectedRows, insertId, durationMs, truncated }`，调试面板展示绑定后的语句、映射后的结果表格与 JSON。
- 接口（权限 `dev_api:*`）：
  - `GET/POST /api/admin/dev/apis`
  - `GET/PUT/DELETE /api/admin/dev/apis/:id`
  - `POST /api/admin/dev/apis/:id/publish`
  - `POST /api/admin/dev/apis/:id/run`（`dev_api:run`）
- 枚举走字典：`dev_api_category` / `dev_api_action` / `dev_api_status`，前端用 `DictTag`。
  当前只做**配置管理 + 在线调试执行**；按接口编码对外开放调用的运行时 API 留待下一阶段。
