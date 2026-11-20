import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';

export const DEV_FIELD_TYPES = [
  'input',
  'textarea',
  'number',
  'select',
  'radio',
  'checkbox',
  'date',
  'datetime',
  'switch',
  // 公共控件库扩展控件
  'slider',
  'color',
  'file',
  'image',
  'qrcode',
  'barcode',
  // 高级控件：弹框选择器（关联表单 / 弹框选择），值以 JSON 字符串写入 varchar/text 列
  'relationForm',
  'dialogSelect',
  // 高级控件：内置数据源的弹框选择器（系统用户 / 系统角色）
  'userSelect',
  'roleSelect',
] as const;

export type DevFieldType = (typeof DEV_FIELD_TYPES)[number];

/** 展示型控件：内容来自固定值/手动输入/字段联动，不需要写库，可不绑定数据库列 */
export const DISPLAY_ONLY_FIELD_TYPES: readonly DevFieldType[] = ['qrcode', 'barcode'];

export const DEV_FORM_LABEL_POSITIONS = ['left', 'right', 'top'] as const;
export type DevFormLabelPosition = (typeof DEV_FORM_LABEL_POSITIONS)[number];

export const DEV_FORM_SIZES = ['large', 'default', 'small'] as const;
export type DevFormSize = (typeof DEV_FORM_SIZES)[number];

/** 表单尺寸档位：控件尺寸 + 默认弹窗宽度 */
export const DEV_FORM_SIZE_PRESETS = ['small', 'medium', 'large'] as const;
export type DevFormSizePreset = (typeof DEV_FORM_SIZE_PRESETS)[number];

/** 弹窗类型：居中弹窗 / 右侧抽屉 / 全屏 */
export const DEV_FORM_DIALOG_TYPES = ['center', 'right', 'fullscreen'] as const;
export type DevFormDialogType = (typeof DEV_FORM_DIALOG_TYPES)[number];

/** 表单宽度可选区间（px）：与前端下拉保持一致，允许自定义值 */
export const DEV_FORM_DIALOG_WIDTH_MIN = 320;
export const DEV_FORM_DIALOG_WIDTH_MAX = 2400;

const CHOICE_TYPES: DevFieldType[] = ['select', 'radio', 'checkbox'];
const RESERVED_FIELD_NAMES = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt']);

export const devFieldSchema = z.object({
  id: z.string().trim().min(1, '字段 id 不能为空').max(64),
  type: z.enum(DEV_FIELD_TYPES),
  label: z.string().trim().min(1, '请输入字段标签').max(100, '字段标签不能超过 100'),
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-zA-Z0-9]{0,49}$/, '字段名需为小驼峰，仅含字母和数字，如 userName'),
  // 关联数据表后，每个字段必须映射到具体数据库列
  columnName: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, '数据库字段名需为 snake_case')
    .optional()
    .nullable(),
  placeholder: z.string().max(200, '占位提示不能超过 200').optional().default(''),
  required: z.boolean().optional().default(false),
  disabled: z.boolean().optional().default(false),
  clearable: z.boolean().optional().default(true),
  // 24 栅格布局；旧数据的 1/2 在 schema 级别按 columns 兼容
  span: z.coerce.number().int().min(1).max(24).optional().default(24),
  // 控件样式：标题宽度（px，为空跟随表单设置）/ 控件宽度（`100%` 或 `320px`，默认 100% 撑满栅格）
  labelWidth: z.union([z.coerce.number().int().min(40).max(400), z.null()]).optional(),
  controlWidth: z
    .union([
      // `100%`（相对栅格，1-100）或 `320px`（1-4000px）
      z
        .string()
        .trim()
        .regex(/^([1-9]\d?|100)%$|^[1-9]\d{0,3}px$/, '控件宽度请填 1%-100% 或 1-4000px')
        .refine(
          (value) => !value.endsWith('px') || Number(value.slice(0, -2)) <= 4000,
          '控件宽度请填 1%-100% 或 1-4000px',
        ),
      // 兼容早期按百分比存数字的草稿
      z.number().int().min(1).max(100),
      z.null(),
    ])
    .optional(),
  // 滑块步长；数字类控件已有 min/max
  step: z.coerce.number().min(0.01, '步长必须大于 0').max(1000).optional(),
  // 日期/日期时间控件的显示与存储格式；仅允许 dayjs token 白名单，空值按控件类型兜底
  dateFormat: z
    .enum([
      'YYYY',
      'YYYY-MM',
      'YYYY-MM-DD',
      'YYYY-MM-DD HH',
      'YYYY-MM-DD HH:mm',
      'YYYY-MM-DD HH:mm:ss',
      // 时间控件（datetime 类型）格式；旧 datetime 日期格式保留以兼容历史表单
      'HH:mm:ss',
      'HH:mm',
    ])
    .nullable()
    .optional(),
  // 二维码/条码内容来源：fixed=固定值，link=关联本表单其他字段；manual 仅兼容历史数据，UI 已移除
  codeSource: z.enum(['manual', 'fixed', 'link']).optional().default('fixed'),
  codeValue: z.string().max(500, '固定内容不能超过 500').optional().default(''),
  codeFields: z.array(z.string().trim().min(1).max(50)).max(20, '最多关联 20 个字段').optional().default([]),
  codeSeparator: z.string().max(10, '分隔符不能超过 10 个字符').optional().default(''),
  // 图片/文件上传：最大上传数（默认 9）、单文件大小上限（MB，默认 10）、允许类型、提示文案
  maxCount: z.coerce.number().int().min(1, '最大上传数至少为 1').max(99, '最多 99 个').optional().default(9),
  maxSize: z.coerce.number().min(0, '文件大小不能为负').max(2048, '单文件不超过 2048MB').optional().default(10),
  // 允许类型多选（image/video/audio/excel/word/ppt/pdf/text/archive），空数组表示不限
  acceptTypes: z
    .array(z.string().trim().min(1).max(20))
    .max(20, '最多 20 个类型')
    .optional()
    .default([]),
  accept: z.string().max(200, '允许类型不能超过 200').optional().default(''),
  tip: z.string().max(200, '上传提示不能超过 200').optional().default(''),
  // 关联表单 / 弹框选择：弹框数据源配置；控件值以 JSON 字符串写入 varchar/text 列
  sourceId: z.number().int().positive().nullable().optional(),
  sourceName: z.string().max(200).nullable().optional(),
  valueField: z.string().trim().max(100).nullable().optional(),
  displayField: z.string().trim().max(100).nullable().optional(),
  listFields: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(100),
        label: z.string().trim().max(100),
      }),
    )
    .max(30, '弹框列表最多 30 列')
    .nullable()
    .optional(),
  multiple: z.boolean().optional().default(false),
  keywordKey: z.string().trim().max(100).nullable().optional(),
  pickerTitle: z.string().max(100).nullable().optional(),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1, '选项标签不能为空').max(100),
        value: z.string().trim().min(1, '选项值不能为空').max(100),
      }),
    )
    .max(50, '单个字段最多 50 个选项')
    .optional()
    .default([]),
  defaultValue: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .nullable()
    .optional(),
  rows: z.coerce.number().int().min(2).max(20).optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
});

export const DEV_QUERY_OPERATORS = ['like', 'eq', 'gt', 'gte', 'lt', 'lte'] as const;
export type DevQueryOperator = (typeof DEV_QUERY_OPERATORS)[number];

export const DEV_COLUMN_SOURCES = ['master', 'subtable'] as const;
export type DevColumnSource = (typeof DEV_COLUMN_SOURCES)[number];

const COLUMN_NAME_RULE = /^[a-z][a-z0-9_]{0,63}$/;

/** 查询区一行：主表列或子表列 + 条件类型 + 默认值 + 关键词等 */
export const devQueryColumnSchema = z.object({
  columnName: z
    .string()
    .trim()
    .regex(COLUMN_NAME_RULE, '查询字段名需为 snake_case'),
  source: z.enum(DEV_COLUMN_SOURCES).optional().default('master'),
  // source='subtable' 时指向子表表名
  tableName: z.string().trim().max(128).optional().nullable().default(null),
  // 对应的表单字段 / 明细字段名，仅用于展示与参数映射兜底
  field: z.string().trim().max(64).optional().default(''),
  operator: z.enum(DEV_QUERY_OPERATORS).optional().default('like'),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
  keyword: z.string().max(200, '关键词不能超过 200').optional().default(''),
  multiple: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
});

/** 列表列一行：主表列或子表列 + 排序 / 冻结 / 对齐 / 宽度 */
export const devListColumnSchema = z.object({
  columnName: z
    .string()
    .trim()
    .regex(COLUMN_NAME_RULE, '列表字段名需为 snake_case'),
  source: z.enum(DEV_COLUMN_SOURCES).optional().default('master'),
  tableName: z.string().trim().max(128).optional().nullable().default(null),
  field: z.string().trim().max(64).optional().default(''),
  sortable: z.boolean().optional().default(false),
  fixed: z.enum(['', 'left', 'right']).optional().default(''),
  align: z.enum(['left', 'center', 'right']).optional().default('left'),
  width: z.coerce.number().int().min(60).max(800).optional().nullable().default(null),
});

export const devFormListSchema = z.object({
  // 查询区展示的数据库列
  queryFields: z.array(z.string().trim().min(1)).max(50).optional().default([]),
  // 列表列展示的数据库列（按数组顺序）
  listFields: z.array(z.string().trim().min(1)).max(50).optional().default([]),
  // 查询条件明细；旧表单没有该字段，运行时回落到 queryFields
  queryColumns: z.array(devQueryColumnSchema).max(50, '查询条件最多 50 个').optional().default([]),
  // 列表列明细；旧表单没有该字段，运行时回落到 listFields
  listColumns: z.array(devListColumnSchema).max(50, '列表字段最多 50 个').optional().default([]),
  // 明细展示方式：merge=主表列与子表列合并成一张表；expand=展开行嵌套表格
  subtableView: z.enum(['merge', 'expand']).optional().default('merge'),
});

export const DEV_FORM_TABLE_ROLES = ['MASTER', 'SLAVE'] as const;
export type DevFormTableRole = (typeof DEV_FORM_TABLE_ROLES)[number];

/**
 * 表单关联的数据表：一张主表承载表单字段与列表，其余从表通过外键指向主表主键。
 * 从表只声明关系，字段归属仍按主表计算，避免一套字段列表混用多张表。
 */
export const devFormTableSchema = z.object({
  role: z.enum(DEV_FORM_TABLE_ROLES),
  tableName: z.string().trim().min(1, '表名不能为空').max(128, '表名不能超过 128'),
  tableComment: z.string().trim().max(255).optional().default(''),
  // 从表必填：从表上的外键列
  foreignKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, '外键字段需为 snake_case')
    .optional()
    .nullable(),
  // 从表必填：被引用的主表列，通常是主键 id
  masterColumn: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, '主表关联字段需为 snake_case')
    .optional()
    .nullable(),
});

/**
 * 明细（从表）列：与主表字段共用一套控件配置（类型 / 标题 / 占位 / 选项 / 样式等），
 * columnName 必填指向从表列，另加「是否在明细表单中展示」。
 */
export const devSubTableColumnSchema = devFieldSchema.extend({
  columnName: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, '明细字段名需为 snake_case'),
  // 明细表单（弹窗录入）默认半行
  span: z.coerce.number().int().min(1).max(24).optional().default(12),
  visible: z.boolean().optional().default(true),
});

/**
 * 子表设计：一张从表对应表单里的一个明细区块。
 * 外键与关联主键由基础设计决定，这里冗余保存用于渲染与校验一致性。
 */
export const devSubTableSchema = z.object({
  id: z.string().trim().min(1, '子表 id 不能为空').max(64),
  tableName: z.string().trim().min(1, '从表名不能为空').max(128),
  label: z.string().trim().min(1, '请输入子表标题').max(100, '子表标题不能超过 100'),
  foreignKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, '外键字段需为 snake_case')
    .optional()
    .nullable()
    .default(null),
  masterColumn: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, '主表关联字段需为 snake_case')
    .optional()
    .nullable()
    .default(null),
  span: z.coerce.number().int().min(1).max(24).optional().default(24),
  mode: z.enum(['table', 'dialog']).optional().default('table'),
  columns: z.array(devSubTableColumnSchema).max(100, '单张从表最多 100 个明细字段').default([]),
  queryFields: z.array(z.string().trim().min(1)).max(50).optional().default([]),
  listFields: z.array(z.string().trim().min(1)).max(50).optional().default([]),
});

const devFormObjectSchema = z
  .object({
    columns: z.union([z.literal(1), z.literal(2)]).optional().default(1),
    labelWidth: z.coerce.number().int().min(60).max(240).optional().default(100),
    labelPosition: z.enum(DEV_FORM_LABEL_POSITIONS).optional().default('right'),
    size: z.enum(DEV_FORM_SIZES).optional().default('default'),
    // 表单尺寸档位：控件尺寸 + 默认弹窗宽度；旧表单没有该字段时按 size 推导
    formSize: z.enum(DEV_FORM_SIZE_PRESETS).optional().default('medium'),
    // 弹窗类型：居中弹窗 / 右侧抽屉 / 全屏
    dialogType: z.enum(DEV_FORM_DIALOG_TYPES).optional().default('center'),
    // 弹窗宽度：null 走默认宽度；支持 px 数字（320-2400）与百分比字符串（30%-100%，相对主内容区）；全屏时忽略
    dialogWidth: z
      .preprocess(
        (value) => (value === '' || value === null || value === undefined ? null : value),
        z
          .union([
            z
              .number()
              .int('表单宽度必须为整数')
              .min(DEV_FORM_DIALOG_WIDTH_MIN, `表单宽度不能小于 ${DEV_FORM_DIALOG_WIDTH_MIN}px`)
              .max(DEV_FORM_DIALOG_WIDTH_MAX, `表单宽度不能大于 ${DEV_FORM_DIALOG_WIDTH_MAX}px`),
            z.string().regex(/^(?:[3-9]\d|100)%$/, '百分比宽度支持 30%-100%'),
          ])
          .nullable(),
      )
      .optional()
      .default(null),
    disabled: z.boolean().optional().default(false),
    labelSuffix: z.string().max(20, '标签后缀不能超过 20').optional().default(''),
    hideRequiredAsterisk: z.boolean().optional().default(false),
    showMessage: z.boolean().optional().default(true),
    statusIcon: z.boolean().optional().default(false),
    fields: z.array(devFieldSchema).max(100, '单个表单最多 100 个字段').default([]),
    list: devFormListSchema.optional().default({ queryFields: [], listFields: [] }),
    // 关联表：1 个主表 + N 个从表；为空表示单表表单，行为与旧版本一致
    tables: z.array(devFormTableSchema).max(20, '最多关联 20 张表').optional().default([]),
    // 子表设计：一张从表一个明细区块；为空表示没有明细
    subtables: z.array(devSubTableSchema).max(20, '最多设计 20 个子表').optional().default([]),
    // 画布排版顺序：fields + subtables 的 id 混排，允许控件插在子表前后；
    // 旧表单没有该字段，渲染回落为「主表字段在前、子表在后」。未知 id 会被渲染端忽略
    layout: z.array(z.string().trim().min(1)).max(200, '排版顺序最多 200 项').optional(),
  })
  .superRefine((schema, ctx) => {
    const names = new Set<string>();
    const columns = new Set<string>();

    schema.fields.forEach((field, index) => {
      if (names.has(field.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `字段名重复：${field.name}`,
          path: ['fields', index, 'name'],
        });
      }
      names.add(field.name);

      if (field.columnName) {
        if (columns.has(field.columnName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `数据库字段重复映射：${field.columnName}`,
            path: ['fields', index, 'columnName'],
          });
        }
        columns.add(field.columnName);
      }

      if (RESERVED_FIELD_NAMES.has(field.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `字段名 ${field.name} 为系统保留字段`,
          path: ['fields', index, 'name'],
        });
      }

      if (CHOICE_TYPES.includes(field.type)) {
        if (field.options.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '选择类字段至少需要一个选项',
            path: ['fields', index, 'options'],
          });
        }
        const values = new Set<string>();
        field.options.forEach((option, optionIndex) => {
          if (values.has(option.value)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `选项值重复：${option.value}`,
              path: ['fields', index, 'options', optionIndex, 'value'],
            });
          }
          values.add(option.value);
        });
      }
    });

    if (schema.tables.length > 0) {
      const masters = schema.tables.filter((table) => table.role === 'MASTER');
      if (masters.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '关联多张表时必须指定唯一的主表',
          path: ['tables'],
        });
      }
      const seenTables = new Set<string>();
      schema.tables.forEach((table, index) => {
        if (seenTables.has(table.tableName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `表重复关联：${table.tableName}`,
            path: ['tables', index, 'tableName'],
          });
        }
        seenTables.add(table.tableName);

        if (table.role !== 'SLAVE') return;
        if (masters.length === 1 && table.tableName === masters[0].tableName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '从表不能与主表相同',
            path: ['tables', index, 'tableName'],
          });
        }
        if (!table.foreignKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `从表 ${table.tableName} 必须选择外键字段`,
            path: ['tables', index, 'foreignKey'],
          });
        }
        if (!table.masterColumn) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `从表 ${table.tableName} 必须选择关联的主表字段`,
            path: ['tables', index, 'masterColumn'],
          });
        }
      });
    }

    if (schema.subtables.length > 0) {
      const slaveTables = new Set(
        schema.tables.filter((table) => table.role === 'SLAVE').map((table) => table.tableName),
      );
      const seenSubtables = new Set<string>();
      schema.subtables.forEach((subtable, index) => {
        if (seenSubtables.has(subtable.tableName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `子表重复：${subtable.tableName}`,
            path: ['subtables', index, 'tableName'],
          });
        }
        seenSubtables.add(subtable.tableName);

        // 子表必须来自基础设计里已声明的从表，避免出现指向不存在关系的明细
        if (!slaveTables.has(subtable.tableName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `子表 ${subtable.tableName} 未在关联从表中声明，请先到基础设计添加该从表`,
            path: ['subtables', index, 'tableName'],
          });
        }

        const columnNames = new Set<string>();
        const fieldNames = new Set<string>();
        subtable.columns.forEach((column, columnIndex) => {
          if (columnNames.has(column.columnName)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `明细字段重复：${column.columnName}`,
              path: ['subtables', index, 'columns', columnIndex, 'columnName'],
            });
          }
          columnNames.add(column.columnName);

          if (fieldNames.has(column.name)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `明细字段名重复：${column.name}`,
              path: ['subtables', index, 'columns', columnIndex, 'name'],
            });
          }
          fieldNames.add(column.name);
        });

        for (const name of [...subtable.queryFields, ...subtable.listFields]) {
          if (!columnNames.has(name)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `子表 ${subtable.tableName} 的查询/明细列不存在：${name}`,
              path: ['subtables', index],
            });
          }
        }
        if (new Set(subtable.queryFields).size !== subtable.queryFields.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `子表 ${subtable.tableName} 的查询字段存在重复`,
            path: ['subtables', index, 'queryFields'],
          });
        }
        if (new Set(subtable.listFields).size !== subtable.listFields.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `子表 ${subtable.tableName} 的明细列存在重复`,
            path: ['subtables', index, 'listFields'],
          });
        }
      });
    }

    // 查询/列表字段明细：子表列必须指向已设计的子表字段，且同一列不能重复出现
    if (schema.list.queryColumns.length > 0 || schema.list.listColumns.length > 0) {
      const subtableColumns = new Map<string, Set<string>>();
      schema.subtables.forEach((subtable) => {
        subtableColumns.set(
          subtable.tableName,
          new Set(subtable.columns.map((column) => column.columnName)),
        );
      });

      const checkColumn = (
        item: { columnName: string; source: DevColumnSource; tableName?: string | null },
        path: (string | number)[],
      ) => {
        if (item.source !== 'subtable') return;
        if (!item.tableName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '引用子表字段时必须指定子表',
            path: [...path, 'tableName'],
          });
          return;
        }
        const columns = subtableColumns.get(item.tableName);
        if (!columns) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `子表 ${item.tableName} 未在设计中出现，不能引用其字段`,
            path: [...path, 'tableName'],
          });
          return;
        }
        if (!columns.has(item.columnName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `子表 ${item.tableName} 的字段 ${item.columnName} 不在明细字段中`,
            path,
          });
        }
      };

      const seenQueryColumns = new Set<string>();
      schema.list.queryColumns.forEach((item, index) => {
        checkColumn(item, ['list', 'queryColumns', index]);
        const key = `${item.source}:${item.tableName ?? ''}:${item.columnName}`;
        if (seenQueryColumns.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `查询字段重复：${item.columnName}`,
            path: ['list', 'queryColumns', index, 'columnName'],
          });
        }
        seenQueryColumns.add(key);
      });

      const seenListColumns = new Set<string>();
      schema.list.listColumns.forEach((item, index) => {
        checkColumn(item, ['list', 'listColumns', index]);
        const key = `${item.source}:${item.tableName ?? ''}:${item.columnName}`;
        if (seenListColumns.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `列表字段重复：${item.columnName}`,
            path: ['list', 'listColumns', index, 'columnName'],
          });
        }
        seenListColumns.add(key);
      });
    }
  });

export const devFormSchema = devFormObjectSchema.transform((schema) => ({
  ...schema,
  fields: schema.fields.map((field) => ({
    ...field,
    // 旧版 1/2 是有列数语义的，按原 columns 转换成 24 栅格
    span:
      field.span === 1
        ? schema.columns === 2
          ? 12
          : 24
        : field.span === 2
          ? 24
          : field.span,
  })),
}));

export const createDevFormSchema = z.object({
  name: z.string().trim().min(1, '请输入表单名称').max(100, '表单名称不能超过 100'),
  formKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,49}$/, '表单编码需为 snake_case，小写字母开头，2-50 位'),
  description: z.string().trim().max(500, '说明不能超过 500').optional().nullable(),
  connectionId: z.coerce.number().int().positive().optional().nullable(),
  tableName: z.string().trim().max(128).optional().nullable(),
  schema: devFormSchema.optional(),
});

export const updateDevFormSchema = z
  .object({
    name: z.string().trim().min(1, '请输入表单名称').max(100, '表单名称不能超过 100').optional(),
    description: z.string().trim().max(500, '说明不能超过 500').optional().nullable(),
    connectionId: z.coerce.number().int().positive().optional().nullable(),
    tableName: z.string().trim().max(128).optional().nullable(),
    schema: devFormSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '没有需要更新的内容' });

export const devFormQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  keyword: z.string().trim().max(100).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});

/** 生成菜单：只需选上级目录，路径/权限由后端按表单推导 */
export const generateFormMenuSchema = z.object({
  parentId: z
    .union([z.coerce.number().int().positive(), z.null()])
    .optional()
    .default(null),
});

export type DevFormFieldInput = z.infer<typeof devFieldSchema>;
export type DevFormListInput = z.infer<typeof devFormListSchema>;
export type DevFormSchemaInput = z.infer<typeof devFormSchema>;
export type CreateDevFormInput = z.infer<typeof createDevFormSchema>;
export type UpdateDevFormInput = z.infer<typeof updateDevFormSchema>;
export type DevFormQuery = z.infer<typeof devFormQuerySchema>;
