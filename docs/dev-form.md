# 在线表单（表单设计 / 在线预览 / 代码生成）—— 完整规格

> 在线表单的完整实现规格。契约条目见 `CLAUDE.md`（§8 索引），这里只写「怎么实现」。
> 改 `views/dev/form`、`modules/dev-form`、`components/form-controls`、代码生成模板时必读。

## 表单设计（在线开发）

- 数据表 `dev_forms`：`name / form_key / description / connection_id / table_name /
  schema_json / status / version / published_at / updated_by`，`form_key` 唯一且为 snake_case。
- 设计器代码结构（单文件不超 2000 行，见 `CLAUDE.md` 前端契约第 10 条）：
  - `admin/src/views/dev/form/designer.vue` 只做装配：`BasicDialog` 外壳、步骤条、保存/发布按钮，
    调一次 `useDesignerStore()` 后 `provideDesigner()` 注入，模板里只挂 5 个子组件；
  - `designer/model.ts`：类型（`SubTableDraft / QueryColumnDraft / CanvasItem …`）、控件库配置、
    字段/上传/日期相关的纯函数（`allowedTypes / createMappedField / applyUploadDefaults / spanModelOf`）；
  - `designer/use*.ts`：领域模型，按依赖顺序装配（下详），每个文件只碰自己那摊状态；
  - `components/DesignerPalette|Canvas|PropsPanel|BasicStep|ListStep.vue`：界面，
    状态通过 `useDesigner()` 注入拿到，不要再往下传 props；
  - 样式跟组件走：外壳样式留在 `designer.vue`，各面板/画布/步骤的 `scoped scss` 跟着自己组件。
- 领域模型的依赖顺序（改代码前先看 `designer/store.ts` 的装配）：
  `useBasicStep`（连接/表/从表）→ `useSelection`（选中态、属性面板 tab、二维码联动）→
  `useCanvasOrder`（fields + subtables 混排序列）→ `useListModel`（第 3 步）→
  `useFieldModel`（字段、上传/日期/弹框选择器默认值、数据源元数据）→
  `useSubtableModel`（明细区块）→ `useCanvasDnd`（拖拽落点）→ `useSchemaIO`（装载/校验/落库/步骤流转）。
  循环依赖用惰性回调打断（`store.ts` 里 `let io / subs / fieldModel` 后赋值），不要硬拉成互相 import。
- 表单设计分三步：
  1. **基础设计**：名称、说明、数据连接、主表、从表。主表必须来自已同步的 `dev_db_tables`，
     且具备 `id` 主键与 `created_at / updated_at / deleted_at` 字段；
     从表可选，用于一对多明细，通过「外键字段 → 主表主键」声明关系（详见下方主从表说明）。
  2. **表单设计**：左侧控件库按类型分组（`基础控件 / 高级控件`，另有独立的「布局组件」），
     控件可无限拖入/点击——有空闲且类型兼容的数据表字段时自动关联，
     没有就先落成「未绑定」控件（卡片虚线 + 「待绑定」标签），由用户在右侧自己选列；
     **进入下一步（以及保存/发布）时统一校验每个数据录入控件都绑定了数据库字段**，未绑定会一次性列出；
     二维码/条码为展示型控件，可不绑定（见下方「公共控件库」）。
     每个字段必须写 `columnName` 映射数据库列；控件字段下拉可清空（解除绑定，字段名回到占位值
     `field_n` 并把第 3 步里指向该列的查询/列表行一起摘掉）；
     字段名自动等于 `camelCase(columnName)`，不可手改；非空列必须保留且必填；
     组件类型必须与列类型兼容（varchar → input/textarea/select/radio/checkbox/color/file/image/qrcode/barcode/relationForm/dialogSelect/userSelect/roleSelect，
     text → textarea/input/file/image/qrcode/barcode/relationForm/dialogSelect/userSelect/roleSelect，int/decimal → number/slider，
     boolean → switch，date → date，datetime → datetime），未绑定时可自由选类型；
     前后端映射分别在 `designer.vue` 的 `allowedTypes()` 与 `dev-form.field-mapper.ts` 的
     `allowedFormTypes()`，新增控件类型必须两边同步。
     - 右侧属性面板用 **tab 切换**：`组件属性 / 组件样式 / 表单属性`（选中子表时多一个 `子表属性`）；
         未选中控件时只保留「表单属性」，其余 tab 不出现。
         - 组件属性：控件类型 / 数据库表 / 控件字段 / 控件标题 / 字段名；
           控件字段下拉展示数据表全部业务列，已被其他控件使用的列标注「已使用」并禁用；
         - 校验与状态（同在组件属性 tab）：必填、禁用、可清空、占位提示、number/slider 最小/最大值、
           slider 步长（step，0.01 起）、选择类选项；
         - 组件样式：**控件栅格**（`span`，2-24，默认 24，12 为半行；**滑动条**：两格一跳，
           刻度 `2 4 6 … 24` 标在滑轨下方，值写回时按两格对齐，不用下拉框）、**标题宽度**（`labelWidth`，px，
           空表示跟随表单级 labelWidth）、**控件宽度**（`controlWidth`，CSS 长度字符串，**手动输入**：
           填 `320px` 为固定像素、填 `50%` 为相对栅格百分比、裸数字按 px 处理，未设置默认 `100%`）、
           textarea 行数；改动即时反映到画布；
         - 表单属性：`labelPosition / labelWidth / formSize / dialogType / dialogWidth / disabled /
           labelSuffix / hideRequiredAsterisk / showMessage / statusIcon`；
           其中 **表单尺寸**（`formSize`：small/medium/large）同时决定控件尺寸（el-form size 分别
           small/default/large）与默认弹窗宽度（720/900/1100px），**弹窗类型**（`dialogType`：
           center 居中弹窗 / right 右侧抽屉 / fullscreen 全屏），**表单宽度**（`dialogWidth`，px，
           下拉预设 560~1600，`null` 表示跟随表单尺寸，全屏时禁用）。
           三者共用 `admin/src/views/dev/form/components/form-dialog.ts` 的常量与 `formWidthOf()`，
           设计器画布、在线预览（FormPreviewTable）、生成代码（`codegen/page-shared.ts`）取值一致；
           旧 schema 没有 `formSize` 时按 `size` 反推，`size` 仍按 formSize 派生写入以兼容旧运行时。
           预览弹窗通过 `AppDialog` 的 `variant="drawer" + direction="rtl"`（右侧抽屉）、
           `fullscreen`（全屏）切换形态，宽度走 `width`；抽屉/全屏由同一份 schema 驱动。
     - **子表组件**：左侧「布局组件」里的「子表」和普通控件一样可反复拖入/点击添加，
       多个子表区块按**手动拖拽顺序**排列（区块标题左侧的拖拽手柄，拖到目标区块即占用其位置）；
       **子表区块和主表控件共用同一个 `el-row` 的 24 栅格流，并按 `schema.layout`
       （fields + subtables 的 id 混排序列）统一渲染**——控件可以插在子表前面/后面，
       子表也能插在任意两个控件中间；旧表单没有 `layout` 时回落「字段在前、子表在后」。
       画布拖拽交互：**整张卡片都可按住拖动**（控件卡片整块、子表区块的标题栏/空白区），
       拖动中原卡片半透明，落点用**插入线 + 「放到这里」悬浮标签**预览（不改变现有排版，
       避免回流抖动）；拖到画布空白处 = 追加到末尾。落点提交统一走 `onCanvasDrop`
       （用拖动过程里持续更新的 `dropHint`，不依赖松手瞬间指针下的元素）。
       删除按钮旁有**复制控件**（保留类型/样式、解除列绑定成「待绑定」，插到原控件后面；
       子表组件复制则解除从表关联，因为同一张从表只能挂一个区块）。
       控件库控件拖到**子表明细区里 = 新增明细列**（区块描边提示），拖到子表标题栏/边缘 =
       按插入线插到子表前/后（主表控件）。
       有闲置从表时自动关联，否则在右侧 `组件属性 → 关联子表` 选择（同一张从表只能挂一个子表组件，
       换表会清空已配明细列）。子表组件同样有 `组件属性（关联子表 / 子表标题 / 录入方式 / 主外键）`、
       `组件样式（24 栅格 span，滑动条）`、`表单属性` 三个 tab。
       预览弹窗（FormPreviewTable）的新增/编辑表单同样按 `schema.layout` 把控件和子表区块混排渲染；
       span 为 24（默认）时仍是整行。
       明细列 = 从左侧控件库直接拖进子表区块的控件（可拖拽排序），选中列后在右侧配置
       `所属子表 / 控件字段 / 控件类型 / 控件标题 / 字段名`（与主表控件完全一致，另有「在明细中显示」开关）；
       拖入时能自动关联未使用的从表列，没有就先建成「未关联字段」，进下一步前统一校验。
       外键列与系统列不能作为明细列，非空列必须必填。
     - **公共控件库**：`admin/src/components/form-controls/` 放全部字段控件实现
       （文本/数值、选择类、日期、开关、滑块 / 颜色选择 / 文件上传 / 图片上传 / 二维码 / 条形码），
       只依赖 Element Plus 与 `qrcode` / `jsbarcode`，通过本地 `CommonField` 契约接收配置，
       **不引用 `@/types/dev` 或任何业务 API**；`FieldControl.vue` 只剩按 `field.type` 分发和
       注入 `api/upload.ts` 上传回调。二维码/条码是**展示型控件**，**不显示输入框/来源说明**，只渲染
       `common-code-control__preview` 靠左展示；内容来源只有两种：`codeSource=fixed`（`codeValue` 固定内容）、
       `link`（`codeFields` 关联本表单其它字段，按选择顺序取 `values` 里的当前值，
       用 `codeSeparator` 拼接；主表字段只关联主表字段、明细列只关联同子表列）。
       设计器属性面板已移除「手动输入」选项，新建默认 `fixed`，旧 `manual` 回读时迁移为 `fixed`
       （后端 zod 仍保留 manual 仅作历史数据兼容、默认 fixed）；运行时读到 manual 则按已存 modelValue 显示。
       固定值/联动结果会回写自身 modelValue 以保证落库；字段名随列绑定变化/字段删除时，
       设计器用 `renameCodeFieldRefs/removeCodeFieldRefs` 维护引用。
       二维码/条码**可不绑定数据库字段**（前端 `isDisplayOnly` + 后端 `DISPLAY_ONLY_FIELD_TYPES` 校验放行，
       拖入时不再自动占用空闲列），但子表明细列仍需绑定从表字段；
       二维码用 `qrcode` 生成 dataURL，条码用 `jsbarcode` 绘制 CODE128，内容过长会提示失败。
       图片上传 / 文件上传支持配置 `maxCount`（最大上传数，默认 9）、`maxSize`（单文件大小上限，MB，默认 10）、
       `acceptTypes`（允许类型**多选**：image/video/audio/excel/word/ppt/pdf/text/archive，图片控件默认 `['image']`、
       文件控件默认空=不限）、`accept`（自定义后缀，如 `.dwg`，与 acceptTypes 合并）、
       `tip`（上传提示，留空自动生成「最多上传 N 个，单个不超过 M MB，支持 图片、PDF」）。
       类型分组与 `accept` 解析在 `form-controls/upload-accept.ts`（`UPLOAD_TYPE_OPTIONS` / `resolveAccept` /
       `parseAcceptTypes` / `isImageUrl`）；旧数据只有 `accept`（如 `image/*`）时设计器回读会自动反解成类型。
       后端 `server/modules/upload/upload-policy.ts` 的落盘白名单覆盖图片/视频/音频/Office/PDF/
       文本/压缩包（mime 未命中时按原始扩展名兜底，仍排除 html/js/svg/exe 等可执行或 XSS 风险类型），
       分片初始化和整文件上传共用同一套判断。
       值的编解码在 `form-controls/upload-value.ts`：单文件存 URL 字符串（兼容旧数据），多文件存 JSON 数组字符串；
       列表单元格统一用 `form-controls/UploadCell.vue` 渲染：`image` 出缩略图（点击可看大图，超过 3 张显示 +N，
       非图片文件降级成下载链接），`file` 出文件名 + 下载链接（非 URL 的历史脏数据只显示文本）；
       子表展开区、明细只读格复用同一组件，主表列表按字段类型动态生成插槽（`upload_<prop>`），
       聚合列的 `, ` 拼接值逐段解析。
       `useUploadControl.ts` 负责 `before-upload` 的大小与类型校验、`limit` 数量上限、`on-exceed` 提示，
       并把 `upload` 回调的进度转成 `el-upload` 的 `onProgress`（列表项显示百分比，失败由它弹错误提示）；
       达到上限后隐藏上传入口：文件控件隐藏「选择文件」按钮，图片控件要给 `el-upload` 根节点加
       `common-image-control__uploader--full` 并用 CSS 隐藏 `.el-upload--picture-card`——
       Element Plus 即使插槽内容为空也会保留那个 104×104 的上传框外壳，只写 `v-if` 会留下一个空虚线框；
       被类型校验拦截的临时文件没有 url，`on-remove` 不能当成「清空全部」。
       设计器属性面板「上传配置」段主表字段与明细列都有，旧字段回读自动补默认值。
       公共上传控件在禁用态（字段 disabled / 传入 disabled，含查看模式）**隐藏上传入口**：
       ImageUploadControl 隐藏「+」卡片、FileUploadControl 隐藏「选择文件」按钮，只展示已上传内容。
     - **高级控件（弹框选择器）**：`relationForm`（关联表单）/ `dialogSelect`（弹框选择）/
       `userSelect`（用户选择）/ `roleSelect`（角色选择）是
       **输入型控件**，必须绑定 `varchar/text` 列（值以 JSON 字符串落库，数值列写不进去），
       不能放进 `DISPLAY_ONLY_TYPES`。弹框选一条/多条后回填 `{v,l}`：单选存对象、多选存数组，
       `v` = 存储字段值、`l` = 回显文本；重新打开表单直接解析还原显示文本，无需反查数据源。
       右侧属性面板「数据源配置」含 `sourceId`（关联表单=已发布表单 id，弹框选择=已发布且
       静态/查询类的数据接口 id）、`valueField`（存储字段）、`displayField`（回显字段）、
       `listFields`（弹框动态列表列）、`multiple`、`keywordKey`（搜索字段）、`pickerTitle`。
       字段候选由 `getDevForm().schema`（行键为目标表单 `field.name`，另含 `id`）或
       `getDevApi().config.fieldMappings`（行键为 `outputKey`）自动加载；`keywordKey` 对关联表单
       取目标表单查询字段、对弹框选择取接口声明的参数（搜索值走参数绑定）。
       运行时拉数由 `FieldControl.vue` 注入 `DataFetchHandler` 回调：关联表单包
       `listPreviewRecords`（表单预览动态 SQL），弹框选择包 `runDevApi`（接口试运行）；
       公共控件不引用这两个业务 API。`form-controls/useDataPicker.ts` 统一处理弹框/分页/
       关键字/单选多选/值编解码，`DataPickerControl.vue` 为共享模板，两个具名控件只做薄封装。
       保存/发布/下一步统一用 `validatePickerConfig` 校验配置完整性，子表明细列同样支持。
       **内置数据源的两个控件**（`userSelect` / `roleSelect`）不需要选数据源：
       `CommonField.builtinSource = 'user' | 'role'` 告诉公共库「没有 sourceId」，
       `useDataPicker` 据此跳过 sourceId 校验、把 query.sourceId 传 0；
       `UserSelectControl` / `RoleSelectControl` 内部把 `valueField=id`、`displayField=nickname|name`、
       `listFields`（账号/昵称/手机号、名称/编码/描述）、`keywordKey=keyword`、`keywordPlaceholder`
       兜底好，schema 里存了空串（旧数据 / 改过类型）也会补回默认值，不会回显成主键 id。
       属性面板只显示「选择配置」（数据来源标签 + 多选 + 弹框标题），不显示数据源/存储字段等配置；
       `applyPickerDefaults` 对内置类型把空串也补成默认值。取数由 `FieldControl.vue` 注入
       `listUsers` / `listRoles`，代码生成产物同样用这两个接口，不依赖表单预览或数据接口。
       **值展示**：所有列出真实数据的表格都不能露出 `{v,l}` 原文——有字段类型的表格
       （`FormPreviewTable` 主表/合并/展开列、`SubTableEditor`/`SubTableNested` 明细）
       用 `form-controls/picker-value.ts` 的 `formatDataPickerCell` / 聚合版还原回显文本，
       并补 `date`/`datetime` 分支走 `utils/datetime`；没有字段类型的表格（数据接口试运行
       `RunDialog`、选值弹框数据表）统一挂 `formatSmartCell`，按值内容识别 JSON 与 ISO 时间。
       新增控件优先放进该目录，再在 FieldControl 里注册分发，设计器左侧分组、类型标签、
       前后端类型枚举与列类型映射都需同步；若新增控件要出现在列表里，同步补上述格式化分支。
     - **日期/时间格式**：`date`/`datetime` 控件支持字段级 `dateFormat`（dayjs token，随 schema 存取）。
       公共库 `form-controls/date-format.ts`：`DEV_DATE_FORMAT_OPTIONS`（date 用 YYYY/YYYY-MM/YYYY-MM-DD）、
       `DEV_TIME_FORMAT_OPTIONS`（datetime 用 HH:mm:ss/HH:mm）、`defaultDateFormat`（date→YYYY-MM-DD，
       datetime→HH:mm:ss）、`dateFormatOf`（datetime 若存旧日期格式自愈为 HH:mm:ss）、`datePickerTypeOf`、
       `isTimeFormat`。**「日期时间」已改为「时间」控件**（type 仍为 datetime 以兼容旧数据与列映射，
       仅 label 改名）：`DateControl.vue` 用 **el-time-picker**（`format`=HH:mm:ss/HH:mm，
       `value-format`=HH:mm:ss），经 `timeModel` computed 桥接：get 用 `formatByPattern(raw,'HH:mm:ss')`
       从完整时间戳/ISO 提取本地时间，set 把选中时间拼回锚定日期（2000-01-01，编辑保留原日期）的
       **完整时间戳**——即交互只选时分秒、底层仍存时间戳到 datetime 列（PG timestamp 列拒绝纯 `14:30:00`，
       切勿直接把纯时间写入库）。codegen 两模板同步生成 el-time-picker + `${name}Time` computed。
       设计器属性面板按类型显示
       「日期格式」/「时间格式」下拉，新建/回读/序列化用 `normalizeDateFormat` 迁移旧值；后端
       `devFieldSchema.dateFormat` enum 含 6 档日期格式 + HH:mm:ss/HH:mm。列表/明细展示用
       `utils/datetime` 的 `formatByPattern(value, dateFormatOf(field))`（支持纯时间值与完整时间戳转本地）。
       代码生成按控件模板输出同款控件（见本节「代码生成模板」），日期/时间/上传/弹框选择
       与在线预览是同一份实现。
  3. **列表设计**：两个表格——「查询字段」与「列表字段」，行内下拉可选主表列或子表列，
     行可拖动排序（HTML5 drag，拖到目标行即占用目标位置）。
     查询字段行可配：条件类型（包含 / 等于 / 大于 / 大于等于 / 小于 / 小于等于）、默认值、
     关键词（查询框提示文案）、是否多选（多值时按 OR / IN 匹配）、是否隐藏
     （不渲染输入框，但默认值仍参与过滤）。
     列表字段行可配：排序（仅主表列）、冻结（左 / 右 / 不冻结）、对齐、宽度（px，空为自适应）。
     有子表时可选「明细展示」：`merge`（默认）主表列与子表列同表、主表单元格按明细行数跨行合并；
     `expand` 主表一行、点行首箭头展开嵌套明细表。`expand` 下子表列用相关子查询聚合展示
     （最多 20 条明细，`string_agg` / `GROUP_CONCAT`）；`merge` 下列表接口带
     `withDetails=1` 返回每行的明细，由前端拍平后用 `span-method` 合并。
     列表字段至少一个；存在子表时，`subtables[].queryFields / listFields` 仍保留，
     用于旧数据兜底与明细编辑器的列（列表设计的子表列不会覆盖它）。
     **`subtables[].listFields` 只表示"明细展示哪些列"，顺序一律以 `columns` 的拖拽顺序为准**
     （`detailColumnsOf()`：先按 listFields 过滤，再按 columns 排序；listFields 为空才全取），
     保存时 `listFields` 也会按 columns 顺序重排，避免旧数据里的顺序和画布不一致。
- `schema_json` 结构：`{ columns:1|2, labelWidth, labelPosition, size, formSize:'small'|'medium'|'large',
  dialogType:'center'|'right'|'fullscreen', dialogWidth:number|null, disabled, labelSuffix,
  hideRequiredAsterisk, showMessage, statusIcon, fields:[{ id,type,label,name,columnName,
  required,disabled,clearable,span,placeholder,options,defaultValue,rows,min,max }],
  list:{ queryFields, listFields, subtableView:'merge'|'expand',
    queryColumns:[{ columnName, source:'master'|'subtable', tableName, field,
      operator:'like'|'eq'|'gt'|'gte'|'lt'|'lte', defaultValue, keyword, multiple, hidden }],
    listColumns:[{ columnName, source, tableName, field, sortable, fixed:''|'left'|'right',
      align:'left'|'center'|'right', width }] },
  tables:[{ role:'MASTER'|'SLAVE', tableName, tableComment, foreignKey, masterColumn }],
  subtables:[{ id, tableName, label, foreignKey, masterColumn, span, mode:'table'|'dialog',
  columns:[{ id, columnName, label, name, type, required, span, visible }],
  queryFields, listFields }] }`；
  字段名小驼峰，实体列名由 `columnName` 决定；
  `span` 使用 24 栅格，旧数据 1/2 会按原 `columns` 自动转换。
  `list.queryColumns / listColumns` 是列表设计的详细配置；为空时运行时回落到
  `queryFields / listFields`，旧表单无需迁移。
- **主从表**：`tables` 非空时有且仅有一个 `MASTER`，其余 `SLAVE` 通过 `foreignKey` 指向主表的
  `masterColumn`（必须是主键）。主表承载表单字段、查询与列表，`dev_forms.table_name` 冗余存主表名；
  从表只声明关系，不参与字段映射。保存时服务端会查真实库校验：表已同步、外键列存在、
  被引用列是主表主键、外键与主键类型兼容（整数族互通）。`tables` 为空时行为与单表表单完全一致。
- **子表**：`subtables` 的每项必须对应一个已声明的 `SLAVE`，`foreignKey / masterColumn`
  由基础设计决定（服务端会校验一致性）；明细字段必须存在于该从表、控件类型兼容、
  非空列必填、外键与系统列不可入选。`queryFields / listFields` 必须是已选明细字段的子集。
  运行时已接入明细：查询区优先按 `list.queryColumns` 里的子表项过滤，缺省回落到
  `subtables[].queryFields`，统一用 `EXISTS` 子查询（同一子表多个条件要求命中同一条明细，
  参数键 `sub_<从表名>_<列名>`）；新增/编辑/查看弹窗按 `mode` 渲染明细表格（行内录入）或明细弹窗，
  明细随主表单同一事务提交——有 `id` 主键的从表按行 upsert（未提交的已有行删除），
  无 `id` 主键的从表按整组替换；删除主记录时级联回收明细（优先软删除）。
- 状态：`DRAFT / PUBLISHED`。已发布表单修改结构后自动回到 `DRAFT`，再次发布时 `version + 1`。
- **在线预览**：表单列表和设计器都提供「预览」，跳转到独立路由
  `/dev/form/preview/:id`，按表单 id 动态渲染关联表的完整 CRUD 页面：
  查询区（查询字段）、ProTable 列表（列表字段、分页、多选）、工具栏与行内增删改查，
  以及按 24 栅格和表单属性渲染的新增 / 编辑 / 查看弹窗。
  设计器预览会先保存草稿，保证当前设计已落库；预览读取已保存 schema 并操作关联表真实数据：
  查询读取真实表，新增/编辑直接写目标表，删除优先软删除（有 `deleted_at` 时写入删除时间，
  无该列时物理删除）。
  有子表设计时按 `list.subtableView` 两种展示：
  `merge`（默认）把列表请求带上 `withDetails=1`，后端用一次 `IN` 查询带回本页所有主记录的明细，
  前端把一条主记录按明细行数拍平成多行（行标识 `__flatKey`，主记录序号 `__index`），
  再用 `ProTable` 透传的 `span-method` 让勾选 / 序号 / 主表列 / 操作列跨行合并，子表列逐行显示明细值；
  设计器没勾选子表列时，预览会自动补上该子表的明细列（顺序同明细列拖拽顺序，`listFields` 为空则取可见字段）。
  列表里同一子表**连续的**多列合并成两级表头：一级 = 子表标题，二级 = 明细字段名
  （不再拼「表名-字段」；只有一列时不合并，仍用「表名-字段」防同名歧义）。
  `expand` 保留展开行（`type: 'expand'` 列 + `SubTableNested.vue`），
  展开区用嵌套表格只读展示明细，展开时才按行请求
  `GET /dev/forms/:id/preview/:rowId/details`（`subtable-detail-cache.ts` 按
  `formId:rowId:version` 合并请求并缓存，主表写操作后自增 version 并清空缓存）。
  弹窗底部同样渲染明细区块，编辑时先拉同一接口回显，保存时以 `details: { <从表名>: rows[] }`
  一并提交，失败整体回滚。
- 接口（权限 `dev_form:*`）：
  - `GET/POST /api/admin/dev/forms`
  - `GET/PUT/DELETE /api/admin/dev/forms/:id`
  - `POST /api/admin/dev/forms/:id/publish`
  - `GET /api/admin/dev/forms/:id/code`（返回文件内容，供弹窗预览）
  - `GET /api/admin/dev/forms/:id/code/zip`（返回 zip 包，供「下载代码」按钮）
- 代码生成只返回文件内容，**绝不自动写服务器磁盘**；前端在代码弹窗中复制/下载，
  由开发者 review 后放入项目。
- **产物统一落在 biz 目录**，zip 内路径即「相对项目根目录」的路径，解压到根目录就位：
  - 后端：`server/src/biz/<formKey>/`（`<formKey>.entity.ts` / `.dto.ts` / `.service.ts` /
    `.controller.ts` / `.route.ts` + `README.md`，建模额外带 `migration.sql`）；
  - 前端：`admin/src/views/biz/<formKey>/`（`index.vue` + `api.ts`，页面内用 `./api` 引入）；
  - zip 打包走 `utils/zip.ts`（纯 Node，deflate + CRC32，UTF-8 文件名，不引第三方库）+
    `utils/code-archive.ts`（`buildCodeArchive` / `sendCodeArchive`），
    README 放在模块目录里，避免解压覆盖仓库根 README。
- **biz 目录自注册**（`server/src/biz/index.ts`）：启动时扫描 `server/src/biz/*/`，
  自动把 `<模块>.entity.ts` 并入 `DataSource.entities`、把 `<模块>.route.ts` 挂到
  `/api/admin/<模块>`。因此复制代码后**不需要**改 `server/src/app.ts` 或
  `server/src/db/entities/index.ts`，重启后端即生效；前端菜单组件路径填 `biz/<formKey>/index`，
  由 `views/**/*.vue` 的 glob 自动收集，同样不用改路由表。
  该目录只放业务代码，框架能力仍在 `server/src/modules/`；新增文件若命名不符约定不会被扫描。
- **关联数据表的表单**：直接对现有表生成 CRUD，不建表：
  - 后端：`<formKey>.entity.ts`（`@Entity(<tableName>)`）、dto/service/controller/route；
    DTO 查询 schema 会按步骤 3 的查询字段生成过滤条件；
  - 前端：`admin/src/views/biz/<formKey>/index.vue` + `api.ts`，
    页面是 ProTable 列表（列=列表字段，查询条件=查询字段）+ 按表单设计生成的新增/编辑弹窗；
  - `README.md` 接入说明；权限 `biz_<formKey>:list|create|update|delete`。
- 未关联数据表的旧表单保留兼容：仍按 `biz_<formKey>` 新表生成（不再推荐）。
- 生成限制：数字字段生成 `int`；日期字段 `YYYY-MM-DD` 转 `Date`；时间字段用
  `el-time-picker` + `computed`（`<name>Input`）桥接，`v-model` 绑 computed，不能绑
  `form.<name>Time`（Payload 类型里没有这个字段）；复杂需求手工调整。
- **代码生成模板**（`server/src/modules/dev-form/codegen/`，**新增控件只改两张表**）：
  - `control-templates.ts`：每种控件的表单代码——控件标签、`import`、`setup` 片段、初始值、
    编辑回填、提交值，`ControlContext.mode` 区分独立表单页（`form`）与关联表 CRUD 页（`table`）；
  - `column-templates.ts`：每种控件的列表单元格（格式化表达式 / 缩略图插槽）、查询条件类型、
    独立建表时的列类型与 zod 校验；
  - `fields.ts` 把模板编译成页面片段，`page-table.ts` / `page-form.ts` / `backend.ts` / `api.ts`
    只负责拼装，加控件时不用动它们；
  - 弹窗形态同样由 schema 驱动：`page-shared.ts` 的 `dialogAttrsOf()` 按 `dialogType` 输出
    `width="..."` / `variant="drawer" direction="rtl" width="..."` / `fullscreen`，
    `elFormSize()` 按 `formSize` 输出 el-form 的 `size`，与在线预览完全一致；
- **表单尺寸与弹窗宽度是两个独立参数**（用户确认不重合）：
  - `formSize`（small/medium/large）**只决定 el-form 的控件尺寸**，不再影响弹窗宽度；
  - `dialogWidth` 独立设置：存 `'600px'` / `'80%'` 字符串或 null（默认 900px）；
    下拉 = 6 档 px（600/800/1000/1200/1400/1600）+ 百分比 50%-100%（el-dialog 百分比相对浏览器窗口）；
    后端 `devFormDialogWidth` 校验 union(数字 320-2400, `/^(?:[3-9]\d|100)%$/`)；
    常量与映射在 `admin/src/views/dev/form/components/form-dialog.ts`
    （`normalizeDialogWidth()` / `formWidthOf(dialogWidth)`，`formSizeWidth` 已删除），
    设计器、预览（`FormPreviewTable`）、`codegen/page-shared.ts#formDialogWidth()` 共用；
    旧 schema 的纯数字 dialogWidth 兼容为 px。全屏时忽略宽度。
  - 图片/文件/二维码/条码/关联表单/弹框选择/用户选择/角色选择**直接复用 `@/components/form-controls` 的公共控件**
    （与在线预览同一实现），其余控件输出 Element Plus 原生标签；
  - 列表单元格优先按**表单字段的控件类型**格式化（时间 → `HH:mm:ss`、多选 → 选项 label、
    弹框选择 → `{v,l}` 回显文本、图片/文件 → `UploadCell` 缩略图/下载链接），没有对应表单字段的列
    再按数据库列类型兜底；
  - 提交值按**数据库列类型**收敛（`toNumber` / `JSON.stringify`），控件类型与列类型不一致时也能编译通过；
  - **子表（明细）已纳入生成页**，与在线预览同一套行为：
    - `subtable-meta.ts` 从 `schema.subtables` + 从表元数据编译 `DetailsCodegenInput`；
      `subtable-page.ts` 生成 `SubTableEditor.vue`（行内/弹窗录入、增删编辑）与
      `SubTableFieldControl.vue`（按明细列控件类型分派公共控件）；
    - 后端 `<key>.service.ts` 多出 `get<Xxx>Details()` / `write<Xxx>Details()` /
      `load<Xxx>DetailAggregates()`，DTO 带 `details` schema，路由多 `GET /:id/details`；
      每个从表单独生成 `<key>_<table>.entity.ts`，并在主 entity 文件 re-export 供 biz 自动注册；
    - 前端 `api.ts` 导出 `get<Xxx>Details()` 与 `XxxDetails` 类型；
      **列表与在线预览一致**：`schema.list.subtableView='merge'`（默认）时，
      `page-table.ts` 生成 `flattenRows()` 把主表记录按明细行数拍平（列标识
      `sub_<从表名>_<列名>`，与主表列 `prop` 区分），`spanMethod()` 让勾选/序号/主表列/操作列
      `rowSpan=明细行数`、子表列每行独立；同一子表连续列生成 `children` 两级表头
      （一级子表标题、二级明细字段），单列时回落「表名·字段」避免重名。
      `row-key` 用 `__flatKey`，勾选/批量删除按主表 `id` 去重；上传明细列同样走 `UploadCell` 插槽，
      选择/日期等按明细控件类型回显。`expand` 模式仍使用后端聚合列；
      新增/编辑/查看弹窗共用回填与 `SubTableEditor`，保存时把 `details` 与主表同事务提交；
    - 列表操作列固定生成 **查看 / 编辑 / 删除** 三按钮，与在线预览一致：查看按
      `biz_<form_key>:list`，`dialogMode='view'` 时 `el-form` 整体禁用、
      `SubTableEditor :readonly`、上传控件显式 `:disabled`（公共上传组件不读 el-form 的 disabled），
      全屏顶部只留「关闭」、普通弹窗 footer 只留「关闭」，`handleSave()` 也直接拦截；
    - 明细行用 `__key` 定位但未提交的行；**删除必须用对象引用比较**，
      后端加载的旧行没有 `__key`，按 `item.__key !== row.__key` 过滤会误删全部；
      提交前 `cleanDetails()` 剥离 `__key`；
    - 父页面 `details` 必须用 `ref`（`v-model="details"` 需要可赋值），
      用 `reactive(const)` 时子组件 emit 新对象会被静默忽略，界面直到重新打开才刷新；
  - 产物附带 `menu.sql`（`codegen/menu-sql.ts`），按权限标识判重、可重复执行，
    末尾带「系统管理员」角色的授权语句（`sys_role_menus`），
    用于把「页面菜单 + 三个按钮权限」同步到目标库；本库则由
    `POST /dev/forms/:id/menu/ensure` 在下载前直接建好。
- 表单设计器从列表以 `BasicDialog` 全屏内容弹窗打开，保留侧边栏/顶栏/页签；
  旧地址 `/dev/form/design/:id` 重定向到 `/dev/form?designId=:id` 并自动打开弹窗。
  页面切换时弹窗隐藏、返回时恢复，未保存编辑内容保留。
- 页面组件名 `DevFormDesign`，生成页面组件名 `Biz<Pascal>`，均需与 keep-alive 命名规则一致。
