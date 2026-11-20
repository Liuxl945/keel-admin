/**
 * 控件模板注册表。
 *
 * ★ 新增一种控件时只改这里：把「表单里的代码 / 需要的 import / 需要的 setup 片段 /
 *   初始值 / 回填 / 提交值」写进对应条目即可，页面生成器不感知具体控件。
 *
 * 约定：
 * - 能直接用 Element Plus 拼出来的控件走原生标签，生成代码可读、无额外依赖；
 * - 内含上传、弹框、二维码渲染等复杂逻辑的控件复用 `@/components/form-controls`
 *   的公共控件（与在线预览完全同一份实现，不会再出现「预览是图片、代码变输入框」）。
 */

import type { DevFormFieldInput } from '../dev-form.dto';
import type { DbColumnInfo } from '../../dev-db-table/dev-db-table.introspect';
import { dateFormatOf, datePickerTypeOf, html, js, singleQuote, type ImportSpec } from './shared';

export type CodegenMode = 'form' | 'table';

export interface ControlContext {
  field: DevFormFieldInput;
  /** form=独立表单页；table=关联数据表的 CRUD 页 */
  mode: CodegenMode;
  /** 关联表模式下该字段对应的数据库列（独立表单模式为 null） */
  column: DbColumnInfo | null;
}

export interface ControlTemplate {
  /** 表单控件标记（不含外层缩进，多行时内部缩进 2 空格） */
  control(ctx: ControlContext): string;
  /** script 里的常量声明（选项、控件配置等） */
  declarations?(ctx: ControlContext): string | null;
  /** 需要的 import（由页面按模块合并） */
  imports?(ctx: ControlContext): ImportSpec[];
  /** 需要的函数/计算属性片段 */
  setup?(ctx: ControlContext): string[];
  /** 表单模型里的类型（table 模式的 FormModel 使用） */
  formType(ctx: ControlContext): string;
  /** 表单初始值表达式 */
  initial(ctx: ControlContext): string;
  /** 编辑回填语句（右侧取 row.<name>） */
  assign(ctx: ControlContext): string;
  /** table 模式提交时取值表达式（form → 接口字段） */
  payload(ctx: ControlContext): string;
  /** 校验规则用 change 触发（选择/日期类），其余 blur */
  changeTrigger?: boolean;
}

const CHOICE_TYPES = ['select', 'radio', 'checkbox'];
const SELECT_TYPES = ['select', 'radio', 'checkbox', 'date', 'datetime', 'image', 'file', 'color', 'qrcode', 'barcode'];

function verbOf(type: string): string {
  return SELECT_TYPES.includes(type) ? '选择' : '输入';
}

function placeholderOf(field: DevFormFieldInput): string {
  return field.placeholder || `请${verbOf(field.type)}${field.label}`;
}

function disabledAttr(field: DevFormFieldInput): string {
  return field.disabled ? ' disabled' : '';
}

function clearableAttr(field: DevFormFieldInput): string {
  return field.clearable === false ? ' :clearable="false"' : ' clearable';
}

function isStringValue(ctx: ControlContext): boolean {
  return !['number', 'slider', 'switch', 'checkbox'].includes(ctx.field.type);
}

/** 选项常量：下拉/单选/多选用同一份，列表列的回显也复用它 */
function optionsDeclaration(field: DevFormFieldInput): string | null {
  if (!CHOICE_TYPES.includes(field.type) || field.options.length === 0) return null;
  const rows = field.options.map(
    (option) => `  { label: ${js(option.label)}, value: ${js(option.value)} },`,
  );
  return [
    `const ${field.name}Options: Array<{ label: string; value: string }> = [`,
    ...rows,
    '];',
  ].join('\n');
}

/** 时间控件（el-time-picker）的计算属性：界面绑定纯时间，提交值仍是完整时间戳 */
function timeComputed(field: DevFormFieldInput): string {
  const name = field.name;
  return [
    `const ${name}Input = computed({`,
    `  get: () => (form.${name} ? formatByPattern(form.${name}, 'HH:mm:ss') : ''),`,
    `  set: (value: string) => {`,
    `    if (!value) { form.${name} = ''; return; };`,
    `    const time = value.length === 5 ? value + ':00' : value;`,
    `    const day = form.${name} && formatByPattern(form.${name}, 'YYYY-MM-DD') !== '-'`,
    `      ? formatByPattern(form.${name}, 'YYYY-MM-DD') : '2000-01-01';`,
    `    form.${name} = day + ' ' + time;`,
    '  },',
    '});',
  ].join('\n');
}

/** 公共控件复用的上传实现：项目统一走分片上传，进度回调直接透传给控件 */
const UPLOAD_SETUP = [
  '/** 上传走项目统一的分片上传接口（进度/重试/续传都在 uploadFile 内部） */',
  'const uploadHandler: UploadHandler = async (file, onProgress) => {',
  '  const result = await uploadFile(file, { onProgress });',
  '  return { url: result.url, name: result.name };',
  '};',
].join('\n');

const RELATION_FETCH_SETUP = [
  '/** 关联表单：读取目标表单的预览数据（行键为表单字段名） */',
  'const relationFormFetch: DataFetchHandler = async (query) => {',
  '  const params: Record<string, unknown> = { page: query.page, pageSize: query.pageSize };',
  '  if (query.keyword && query.keywordKey) params[query.keywordKey] = query.keyword;',
  '  const result = await listPreviewRecords(Number(query.sourceId), params);',
  '  return { rows: result.list as Record<string, unknown>[], total: result.total };',
  '};',
].join('\n');

const USER_FETCH_SETUP = [
  '/** 用户选择：系统用户分页列表（内置数据源） */',
  'const userSelectFetch: DataFetchHandler = async (query) => {',
  '  const result = await listUsers({',
  '    page: query.page,',
  '    pageSize: query.pageSize,',
  '    keyword: query.keyword || undefined,',
  '  });',
  '  return {',
  '    rows: (result.list ?? []) as unknown as Record<string, unknown>[],',
  '    total: result.total ?? 0,',
  '  };',
  '};',
].join('\n');

const ROLE_FETCH_SETUP = [
  '/** 角色选择：系统角色分页列表（内置数据源） */',
  'const roleSelectFetch: DataFetchHandler = async (query) => {',
  '  const result = await listRoles({',
  '    page: query.page,',
  '    pageSize: query.pageSize,',
  '    keyword: query.keyword || undefined,',
  '  });',
  '  return {',
  '    rows: (result.list ?? []) as unknown as Record<string, unknown>[],',
  '    total: result.total ?? 0,',
  '  };',
  '};',
].join('\n');

const DIALOG_FETCH_SETUP = [
  '/** 弹框选择：执行数据接口（行键为接口字段映射里的 outputKey） */',
  'const dialogSelectFetch: DataFetchHandler = async (query) => {',
  '  const params: Record<string, string | number | boolean | null> = {};',
  '  if (query.keyword && query.keywordKey) params[query.keywordKey] = query.keyword;',
  '  const result = await runDevApi(Number(query.sourceId), {',
  '    params,',
  '    page: query.page,',
  '    pageSize: query.pageSize,',
  '  });',
  '  const rows = (result.rows ?? []).filter(',
  '    (row): row is Record<string, unknown> =>',
  "      Boolean(row) && typeof row === 'object' && !Array.isArray(row),",
  '  );',
  '  return { rows, total: result.total ?? rows.length };',
  '};',
].join('\n');

/** 控件配置常量（CommonField 结构）：公共控件按它渲染，等价于设计器里的那份配置 */
function fieldConfig(field: DevFormFieldInput, extra: Record<string, unknown>): string {
  const config: Record<string, unknown> = {
    type: field.type,
    label: field.label,
    placeholder: field.placeholder || '',
    ...extra,
  };
  const body = Object.entries(config)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)},`);
  return [`const ${field.name}Field: CommonField = {`, ...body, '};'].join('\n');
}

function uploadControl(ctx: ControlContext, component: 'ImageUploadControl' | 'FileUploadControl'): string {
  const { field } = ctx;
  return `<${component} v-model="form.${field.name}" :field="${field.name}Field" :upload="uploadHandler"${disabledAttr(field)} />`;
}

function uploadConfig(field: DevFormFieldInput): string {
  return fieldConfig(field, {
    maxCount: field.maxCount ?? 9,
    maxSize: field.maxSize ?? 10,
    accept: field.accept || '',
    acceptTypes: field.acceptTypes ?? [],
    tip: field.tip || '',
  });
}

/** 选择器组件 → 对应的取数函数名 */
const PICKER_FETCHERS: Record<string, string> = {
  RelationFormControl: 'relationFormFetch',
  DialogSelectControl: 'dialogSelectFetch',
  UserSelectControl: 'userSelectFetch',
  RoleSelectControl: 'roleSelectFetch',
};

function pickerControl(ctx: ControlContext, component: string): string {
  const { field } = ctx;
  const fetcher = PICKER_FETCHERS[component] ?? 'relationFormFetch';
  return `<${component} v-model="form.${field.name}" :field="${field.name}Field" :fetch="${fetcher}"${disabledAttr(field)} />`;
}

function pickerConfig(field: DevFormFieldInput): string {
  return fieldConfig(field, {
    sourceId: field.sourceId ?? null,
    sourceName: field.sourceName ?? '',
    valueField: field.valueField ?? '',
    displayField: field.displayField ?? '',
    listFields: field.listFields ?? [],
    multiple: Boolean(field.multiple),
    keywordKey: field.keywordKey ?? '',
    pickerTitle: field.pickerTitle || `${field.label}`,
  });
}

/** 用户 / 角色选择的默认弹框列：设计器里没手动配就用这套 */
const USER_PICKER_COLUMNS = [
  { key: 'username', label: '账号' },
  { key: 'nickname', label: '昵称' },
  { key: 'phone', label: '手机号' },
];

const ROLE_PICKER_COLUMNS = [
  { key: 'name', label: '角色名称' },
  { key: 'code', label: '角色编码' },
  { key: 'description', label: '描述' },
];

function builtinPickerConfig(field: DevFormFieldInput, kind: 'user' | 'role'): string {
  const defaults = kind === 'user' ? USER_PICKER_COLUMNS : ROLE_PICKER_COLUMNS;
  return fieldConfig(field, {
    valueField: 'id',
    displayField: kind === 'user' ? 'nickname' : 'name',
    listFields: field.listFields?.length ? field.listFields : defaults,
    multiple: Boolean(field.multiple),
    keywordKey: 'keyword',
    pickerTitle: field.pickerTitle || (kind === 'user' ? '选择用户' : '选择角色'),
  });
}

function codeControl(ctx: ControlContext, component: 'QrCodeControl' | 'BarCodeControl'): string {
  const { field } = ctx;
  return [
    `<${component}`,
    `  v-model="form.${field.name}"`,
    `  :field="${field.name}Field"`,
    '  :values="form"',
    '  :code-labels="codeLabels"',
    `${disabledAttr(field)}`.trimEnd(),
    '/>',
  ]
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

function codeConfig(field: DevFormFieldInput): string {
  return fieldConfig(field, {
    codeSource: field.codeSource ?? 'fixed',
    codeValue: field.codeValue ?? '',
    codeFields: field.codeFields ?? [],
    codeSeparator: field.codeSeparator ?? '',
  });
}

/** 字符串类控件的通用后端表达式（上传/弹框/文本都一样处理） */
function stringTemplate(overrides: Partial<ControlTemplate> = {}): ControlTemplate {
  return {
    control: () => '',
    formType: () => 'string',
    initial: (ctx) =>
      typeof ctx.field.defaultValue === 'string' ? js(ctx.field.defaultValue) : "''",
    assign: ({ field }) => `form.${field.name} = row.${field.name} ?? '';`,
    payload: ({ field, column }) =>
      column?.nullable === false ? `form.${field.name}` : `form.${field.name} ?? ''`,
    ...overrides,
  };
}

export const CONTROL_TEMPLATES: Record<string, ControlTemplate> = {
  input: stringTemplate({
    control: ({ field }) =>
      `<el-input v-model="form.${field.name}" placeholder="${html(placeholderOf(field))}"${clearableAttr(field)}${disabledAttr(field)} />`,
  }),

  textarea: stringTemplate({
    control: ({ field }) =>
      `<el-input v-model="form.${field.name}" type="textarea" :rows="${field.rows ?? 4}" placeholder="${html(placeholderOf(field))}"${disabledAttr(field)} />`,
  }),

  number: {
    control: ({ field }) => {
      const min = field.min !== undefined ? ` :min="${field.min}"` : '';
      const max = field.max !== undefined ? ` :max="${field.max}"` : '';
      return `<el-input-number v-model="form.${field.name}"${min}${max}${disabledAttr(field)} placeholder="${html(placeholderOf(field))}" style="width: 100%" />`;
    },
    formType: () => 'number | null',
    initial: ({ field, mode }) => {
      if (typeof field.defaultValue === 'number') return String(field.defaultValue);
      // 独立表单页的上传类型里可选数字用 undefined，表格页的 FormModel 统一用 null
      if (mode === 'form') return field.required ? '0' : 'undefined';
      return 'null';
    },
    assign: ({ field }) => `form.${field.name} = row.${field.name} ?? null;`,
    payload: ({ field, column }) =>
      column && column.nullable === false
        ? `form.${field.name} ?? 0`
        : `form.${field.name} ?? undefined`,
  },

  select: stringTemplate({
    declarations: ({ field }) => optionsDeclaration(field),
    control: ({ field }) =>
      [
        `<el-select v-model="form.${field.name}" placeholder="${html(placeholderOf(field))}"${clearableAttr(field)}${disabledAttr(field)} style="width: 100%">`,
        `  <el-option v-for="item in ${field.name}Options" :key="item.value" :label="item.label" :value="item.value" />`,
        '</el-select>',
      ].join('\n'),
    changeTrigger: true,
  }),

  radio: stringTemplate({
    declarations: ({ field }) => optionsDeclaration(field),
    changeTrigger: true,
    control: ({ field }) =>
      [
        `<el-radio-group v-model="form.${field.name}"${disabledAttr(field)}>`,
        `  <el-radio v-for="item in ${field.name}Options" :key="item.value" :value="item.value">{{ item.label }}</el-radio>`,
        '</el-radio-group>',
      ].join('\n'),
  }),

  checkbox: {
    declarations: ({ field }) => optionsDeclaration(field),
    changeTrigger: true,
    control: ({ field }) =>
      [
        `<el-checkbox-group v-model="form.${field.name}"${disabledAttr(field)}>`,
        `  <el-checkbox v-for="item in ${field.name}Options" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox>`,
        '</el-checkbox-group>',
      ].join('\n'),
    formType: () => 'string[]',
    initial: ({ field }) => (Array.isArray(field.defaultValue) ? JSON.stringify(field.defaultValue) : '[]'),
    // 数据库里可能存 JSON 字符串也可能已经反序列化成数组，统一走 decodeMulti 还原
    assign: ({ field }) => `form.${field.name} = decodeMulti(row.${field.name});`,
    // 关联表模式的列多为 text，接口字段是字符串，提交前序列化
    payload: ({ field, column }) =>
      column && ['simple-json', 'json'].includes(column.type ?? '')
        ? `form.${field.name}`
        : `JSON.stringify(form.${field.name} ?? [])`,
  },

  date: stringTemplate({
    changeTrigger: true,
    control: ({ field }) => {
      const format = dateFormatOf(field);
      const pickerType = datePickerTypeOf(format);
      return `<el-date-picker v-model="form.${field.name}" type="${pickerType}" format="${format}" value-format="${format}" placeholder="${html(placeholderOf(field))}"${clearableAttr(field)}${disabledAttr(field)} style="width: 100%" />`;
    },
  }),

  datetime: stringTemplate({
    changeTrigger: true,
    control: ({ field }) => {
      const format = dateFormatOf(field);
      return `<el-time-picker v-model="${field.name}Input" format="${format}" value-format="HH:mm:ss" placeholder="${html(placeholderOf(field))}"${clearableAttr(field)}${disabledAttr(field)} style="width: 100%" />`;
    },
    setup: ({ field }) => [timeComputed(field)],
    imports: () => [{ from: '@/utils/datetime', names: ['formatByPattern'] }],
  }),

  switch: {
    control: ({ field }) => `<el-switch v-model="form.${field.name}"${disabledAttr(field)} />`,
    formType: () => 'boolean',
    initial: ({ field }) => (field.defaultValue === true ? 'true' : 'false'),
    assign: ({ field }) => `form.${field.name} = Boolean(row.${field.name});`,
    payload: ({ field }) => `form.${field.name}`,
  },

  slider: {
    control: ({ field }) => {
      const min = field.min ?? 0;
      const max = (field.max ?? 100) <= min ? min + 100 : (field.max ?? 100);
      const step = (field.step ?? 1) > 0 ? (field.step ?? 1) : 1;
      return `<el-slider v-model="form.${field.name}" :min="${min}" :max="${max}" :step="${step}" show-input :show-input-controls="false"${disabledAttr(field)} />`;
    },
    formType: () => 'number',
    initial: ({ field }) =>
      typeof field.defaultValue === 'number' ? String(field.defaultValue) : String(field.min ?? 0),
    assign: ({ field }) => `form.${field.name} = Number(row.${field.name} ?? ${field.min ?? 0});`,
    payload: ({ field }) => `form.${field.name}`,
  },

  color: stringTemplate({
    control: ({ field }) =>
      [
        '<div style="display: flex; gap: 8px; align-items: center">',
        `  <el-color-picker v-model="form.${field.name}" show-alpha color-format="hex"${clearableAttr(field)}${disabledAttr(field)} />`,
        `  <span style="font-size: 12px; color: var(--el-text-color-secondary)">{{ form.${field.name} || '${html(field.label)}颜色' }}</span>`,
        '</div>',
      ].join('\n'),
  }),

  image: stringTemplate({
    declarations: ({ field }) => uploadConfig(field),
    imports: () => [
      {
        from: '@/components/form-controls',
        names: ['ImageUploadControl', 'type CommonField', 'type UploadHandler'],
      },
      { from: '@/api/upload', names: ['uploadFile'] },
    ],
    setup: () => [UPLOAD_SETUP],
    control: (ctx) => uploadControl(ctx, 'ImageUploadControl'),
  }),

  file: stringTemplate({
    declarations: ({ field }) => uploadConfig(field),
    imports: () => [
      {
        from: '@/components/form-controls',
        names: ['FileUploadControl', 'type CommonField', 'type UploadHandler'],
      },
      { from: '@/api/upload', names: ['uploadFile'] },
    ],
    setup: () => [UPLOAD_SETUP],
    control: (ctx) => uploadControl(ctx, 'FileUploadControl'),
  }),

  qrcode: stringTemplate({
    declarations: ({ field }) => codeConfig(field),
    imports: () => [
      { from: '@/components/form-controls', names: ['QrCodeControl', 'type CommonField'] },
    ],
    control: (ctx) => codeControl(ctx, 'QrCodeControl'),
  }),

  barcode: stringTemplate({
    declarations: ({ field }) => codeConfig(field),
    imports: () => [
      { from: '@/components/form-controls', names: ['BarCodeControl', 'type CommonField'] },
    ],
    control: (ctx) => codeControl(ctx, 'BarCodeControl'),
  }),

  relationForm: stringTemplate({
    declarations: ({ field }) => pickerConfig(field),
    imports: () => [
      {
        from: '@/components/form-controls',
        names: ['RelationFormControl', 'type CommonField', 'type DataFetchHandler'],
      },
      { from: '@/api/dev-form-preview', names: ['listPreviewRecords'] },
    ],
    setup: () => [RELATION_FETCH_SETUP],
    control: (ctx) => pickerControl(ctx, 'RelationFormControl'),
  }),

  dialogSelect: stringTemplate({
    declarations: ({ field }) => pickerConfig(field),
    imports: () => [
      {
        from: '@/components/form-controls',
        names: ['DialogSelectControl', 'type CommonField', 'type DataFetchHandler'],
      },
      { from: '@/api/dev-api', names: ['runDevApi'] },
    ],
    setup: () => [DIALOG_FETCH_SETUP],
    control: (ctx) => pickerControl(ctx, 'DialogSelectControl'),
  }),

  userSelect: stringTemplate({
    declarations: ({ field }) => builtinPickerConfig(field, 'user'),
    imports: () => [
      {
        from: '@/components/form-controls',
        names: ['UserSelectControl', 'type CommonField', 'type DataFetchHandler'],
      },
      { from: '@/api/user', names: ['listUsers'] },
    ],
    setup: () => [USER_FETCH_SETUP],
    control: (ctx) => pickerControl(ctx, 'UserSelectControl'),
  }),

  roleSelect: stringTemplate({
    declarations: ({ field }) => builtinPickerConfig(field, 'role'),
    imports: () => [
      {
        from: '@/components/form-controls',
        names: ['RoleSelectControl', 'type CommonField', 'type DataFetchHandler'],
      },
      { from: '@/api/role', names: ['listRoles'] },
    ],
    setup: () => [ROLE_FETCH_SETUP],
    control: (ctx) => pickerControl(ctx, 'RoleSelectControl'),
  }),
};

/** 未登记的控件类型按单行文本兜底，保证生成不中断 */
const FALLBACK: ControlTemplate = CONTROL_TEMPLATES.input;

export function controlTemplateOf(type: string): ControlTemplate {
  return CONTROL_TEMPLATES[type] ?? FALLBACK;
}

/** 校验规则：必填才生成，switch 由默认值兜底 */
export function ruleOf(field: DevFormFieldInput): string | null {
  if (!field.required || field.type === 'switch') return null;
  const template = controlTemplateOf(field.type);
  if (field.type === 'checkbox') {
    return `  ${field.name}: [{ type: 'array', required: true, message: ${singleQuote(`请选择${field.label}`)}, trigger: 'change' }],`;
  }
  const trigger = template.changeTrigger ? 'change' : 'blur';
  return `  ${field.name}: [{ required: true, message: ${singleQuote(`请${verbOf(field.type)}${field.label}`)}, trigger: '${trigger}' }],`;
}
