/**
 * 表单设计器的静态模型：类型、控件库配置、字段/上传/日期相关的纯函数。
 * 这里不持有任何响应式状态，所有调用方都可以安全复用。
 */
import { computed } from 'vue';
import {
  ArrowDown,
  Brush,
  Calendar,
  CircleCheck,
  Clock,
  Document,
  DocumentChecked,
  EditPen,
  Files,
  Link,
  Menu,
  Odometer,
  Operation,
  Picture,
  Postcard,
  Search,
  SwitchButton,
  User,
  UserFilled,
} from '@element-plus/icons-vue';
import {
  DEV_DATE_FORMAT_OPTIONS,
  DEV_TIME_FORMAT_OPTIONS,
  defaultDateFormat,
  isTimeFormat,
  parseAcceptTypes,
} from '@/components/form-controls';
import { DEFAULT_CONTROL_WIDTH } from '../components/field-style';
import type {
  DevColumnSource,
  DevFieldType,
  DevFormDialogType,
  DevFormField,
  DevFormLabelPosition,
  DevFormSizePreset,
  DevListAlign,
  DevListFixed,
  DevQueryOperator,
  DevSubTableColumn,
  DevSubTableMode,
} from '@/types/dev';
import type { SyncedColumn } from '@/types/dev-db';

/** 主表的系统列不参与表单设计 */
export const SYSTEM_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);

export type PropsTab = 'field' | 'style' | 'form' | 'subtable' | 'substyle';

export const typeLabels: Record<DevFieldType, string> = {
  input: '单行文本',
  textarea: '多行文本',
  number: '数字',
  select: '下拉选择',
  radio: '单选框组',
  checkbox: '多选框组',
  date: '日期',
  datetime: '时间',
  switch: '开关',
  slider: '滑块',
  color: '颜色选择',
  file: '文件上传',
  image: '图片上传',
  qrcode: '二维码',
  barcode: '条形码',
  relationForm: '关联表单',
  dialogSelect: '弹框选择',
  userSelect: '用户选择',
  roleSelect: '角色选择',
};

export interface PaletteItem {
  type: DevFieldType;
  label: string;
  icon: unknown;
  hint?: string;
}

/** 控件库按类型分组：基础控件可直接拖入；高级控件为弹框选择器 */
export const controlGroups: Array<{
  key: 'basic' | 'advanced';
  label: string;
  hint: string;
  items: PaletteItem[];
}> = [
  {
    key: 'basic',
    label: '基础控件',
    hint: '拖入表单或点击添加',
    items: [
      { type: 'input', label: '单行文本', icon: EditPen },
      { type: 'textarea', label: '多行文本', icon: Document },
      { type: 'number', label: '数字', icon: Odometer },
      { type: 'select', label: '下拉选择', icon: ArrowDown },
      { type: 'radio', label: '单选框组', icon: CircleCheck },
      { type: 'checkbox', label: '多选框组', icon: DocumentChecked },
      { type: 'date', label: '日期', icon: Calendar },
      { type: 'datetime', label: '时间', icon: Clock },
      { type: 'switch', label: '开关', icon: SwitchButton },
      { type: 'slider', label: '滑块', icon: Operation },
      { type: 'color', label: '颜色选择', icon: Brush },
      { type: 'file', label: '文件上传', icon: Files },
      { type: 'image', label: '图片上传', icon: Picture },
      { type: 'qrcode', label: '二维码', icon: Postcard },
      { type: 'barcode', label: '条形码', icon: Menu },
    ],
  },
  {
    key: 'advanced',
    label: '高级控件',
    hint: '拖入表单或点击添加',
    items: [
      { type: 'relationForm', label: '关联表单', icon: Link },
      { type: 'dialogSelect', label: '弹框选择', icon: Search },
      { type: 'userSelect', label: '用户选择', icon: User },
      { type: 'roleSelect', label: '角色选择', icon: UserFilled },
    ],
  },
];

/** 未绑定控件可选的控件类型；绑定数据库字段后再按列类型收敛 */
export const allFieldTypes: DevFieldType[] = [
  'input',
  'textarea',
  'number',
  'select',
  'radio',
  'checkbox',
  'date',
  'datetime',
  'switch',
  'relationForm',
  'dialogSelect',
  'userSelect',
  'roleSelect',
];

export const OPERATOR_OPTIONS: Array<{ value: DevQueryOperator; label: string }> = [
  { value: 'like', label: '包含' },
  { value: 'eq', label: '等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
];

export const FIXED_OPTIONS: Array<{ value: DevListFixed; label: string }> = [
  { value: '', label: '不冻结' },
  { value: 'left', label: '冻结左侧' },
  { value: 'right', label: '冻结右侧' },
];

export const ALIGN_OPTIONS: Array<{ value: DevListAlign; label: string }> = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
];

/* ---------------- 拖拽 MIME ---------------- */

export const CONTROL_MIME = 'application/x-dev-form-control';
export const SUBTABLE_MIME = 'application/x-dev-form-subtable';
export const SUBCOLUMN_MIME = 'application/x-dev-form-subcolumn';
export const SUBTABLE_BLOCK = 'block';

/* ---------------- 草稿类型 ---------------- */

export interface SlaveTableDraft {
  /** 行内唯一 key，表名可被改来改去，不能拿表名当 key */
  key: string;
  tableName: string;
  tableComment: string;
  /** 从表上的外键列 */
  foreignKey: string;
  /** 被引用的主表主键列 */
  masterColumn: string;
  columns: SyncedColumn[];
  loading: boolean;
}

/** 第 3 步：查询条件的一行（列名 + 字段 + 条件类型 + 默认值 + 关键词 + 多选/隐藏） */
export interface QueryColumnDraft {
  /** 行标识：列名可切换，不能用列名当 key */
  key: string;
  columnName: string;
  source: DevColumnSource;
  /** source='subtable' 时为目标从表 */
  tableName: string;
  operator: DevQueryOperator;
  defaultValue: string;
  /** 查询框提示文案 */
  keyword: string;
  multiple: boolean;
  hidden: boolean;
}

/** 第 3 步：列表列的一行（列名 + 字段 + 排序/冻结/对齐/宽度） */
export interface ListColumnDraft {
  key: string;
  columnName: string;
  source: DevColumnSource;
  tableName: string;
  sortable: boolean;
  fixed: DevListFixed;
  align: DevListAlign;
  width: number | null;
}

export interface ColumnOption {
  value: string;
  label: string;
  source: DevColumnSource;
  tableName: string;
  columnName: string;
}

/** 明细列：就是拖进子表区块的基础控件，columnName 指向从表列 */
export type SubTableColumnDraft = DevSubTableColumn;

export interface SubTableDraft {
  /** 区块 id，表名不能当 key（同一张表可能先删后加） */
  id: string;
  tableName: string;
  label: string;
  foreignKey: string;
  masterColumn: string;
  span: number;
  mode: DevSubTableMode;
  columns: SubTableColumnDraft[];
  queryFields: string[];
  listFields: string[];
}

export type CanvasKind = 'field' | 'subtable';

export interface CanvasItem {
  kind: CanvasKind;
  id: string;
  index: number;
  span: number;
  field: DevFormField | null;
  sub: SubTableDraft | null;
}

export type DropPosition = 'before' | 'after';

/** 落点提示：插到第 index 个控件的前面/后面（index 允许等于长度，表示追加到末尾） */
export interface DropHint {
  index: number;
  position: DropPosition;
}

export interface FormSettings {
  labelPosition: DevFormLabelPosition;
  /** 表单尺寸：只决定控件尺寸档位（small/default/large），不影响弹窗宽度 */
  formSize: DevFormSizePreset;
  /** 弹窗类型：居中弹窗 / 右侧抽屉 / 全屏 */
  dialogType: DevFormDialogType;
  /** 弹窗宽度：`'600px'` / `'80%'`，null 走默认宽度 */
  dialogWidth: number | string | null;
  disabled: boolean;
  labelSuffix: string;
  hideRequiredAsterisk: boolean;
  showMessage: boolean;
  statusIcon: boolean;
}

/** 表单尺寸只管控件大小；弹窗宽度独立设置（px 精简 + 百分比） */
export {
  DIALOG_TYPE_OPTIONS,
  DIALOG_WIDTH_OPTIONS,
  FORM_SIZE_OPTIONS,
  elSizeOf,
  formWidthOf,
  normalizeDialogType,
  normalizeFormSize,
} from '../components/form-dialog';


/* ---------------- 纯函数 ---------------- */

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `f_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function toCamel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

export function allowedTypes(column: SyncedColumn | null): DevFieldType[] {
  if (!column) return ['input'];
  // 与后端 dev-form.field-mapper.ts 的 allowedFormTypes 保持一致
  if (column.type === 'varchar') {
    return [
      'input',
      'textarea',
      'select',
      'radio',
      'checkbox',
      'color',
      'file',
      'image',
      'qrcode',
      'barcode',
      'relationForm',
      'dialogSelect',
      'userSelect',
      'roleSelect',
    ];
  }
  // 弹框选择器把 {v,l} 序列化成 JSON 文本，只能落在字符串列
  if (column.type === 'text')
    return [
      'textarea',
      'input',
      'file',
      'image',
      'qrcode',
      'barcode',
      'relationForm',
      'dialogSelect',
      'userSelect',
      'roleSelect',
    ];
  if (column.type === 'int' || column.type === 'decimal') return ['number', 'slider'];
  if (column.type === 'boolean') return ['switch'];
  if (column.type === 'date') return ['date'];
  if (column.type === 'datetime') return ['datetime'];
  return ['input'];
}

export function defaultType(column: SyncedColumn): DevFieldType {
  if (column.type === 'varchar') return 'input';
  if (column.type === 'text') return 'textarea';
  if (column.type === 'int' || column.type === 'decimal') return 'number';
  if (column.type === 'boolean') return 'switch';
  if (column.type === 'date') return 'date';
  if (column.type === 'datetime') return 'datetime';
  return 'input';
}

export function defaultOptionsFor(type: DevFieldType): DevFormField['options'] {
  if (!['select', 'radio', 'checkbox'].includes(type)) return [];
  return [
    { label: '选项1', value: 'option1' },
    { label: '选项2', value: 'option2' },
  ];
}

/** datetime 是纯时间控件，属性面板展示时间格式选项；date 展示日期格式选项 */
export function formatOptionsOf(type: DevFieldType): typeof DEV_DATE_FORMAT_OPTIONS {
  return type === 'datetime' ? DEV_TIME_FORMAT_OPTIONS : DEV_DATE_FORMAT_OPTIONS;
}
export function formatLabelOf(type: DevFieldType): string {
  return type === 'datetime' ? '时间格式' : '日期格式';
}
export function formatHintOf(type: DevFieldType): string {
  return type === 'datetime' ? '按所选格式显示并提交时间' : '按所选格式显示并提交日期';
}

/**
 * 回读时规范化日期/时间格式：
 * - datetime 已改为纯时间控件，旧表单里存的日期格式统一迁移为 HH:mm:ss；
 * - date 控件旧值若不是日期格式则回到 YYYY-MM-DD。
 */
export function normalizeDateFormat(type: DevFieldType, stored?: string | null): string {
  if (type === 'datetime') {
    return isTimeFormat(stored) ? stored! : 'HH:mm:ss';
  }
  if (type === 'date') {
    const ok = DEV_DATE_FORMAT_OPTIONS.some((item) => item.value === stored);
    return ok ? stored! : 'YYYY-MM-DD';
  }
  return stored ?? '';
}

/** 日期/时间控件补默认格式；已有配置不覆盖 */
export function applyDateFormatDefault(field: DevFormField, type: DevFieldType): void {
  if ((type === 'date' || type === 'datetime') && !field.dateFormat) {
    field.dateFormat = defaultDateFormat(type);
  }
}

/**
 * 允许类型归一化：
 * 1) 已配置类型直接用；2) 旧数据只有 accept 时反解成类型（image/* → 图片）；
 * 3) 全新字段图片默认勾「图片」，文件默认不限。
 */
export function normalizeAcceptTypes(
  field: DevFormField,
  type: DevFieldType = field.type,
): string[] {
  const configured = field.acceptTypes;
  if (Array.isArray(configured) && configured.length > 0) return [...configured];
  const { types, rest } = parseAcceptTypes(field.accept);
  if (types.length > 0) {
    field.accept = rest.join(',');
    return types;
  }
  // 图片控件没配过任何类型时默认只收图片；文件控件默认不限
  if (!field.accept && !Array.isArray(configured) && type === 'image') return ['image'];
  return [];
}

/** 图片/文件上传补默认参数：最多 9 个、单个 10MB；图片默认只允许图片类型 */
export function applyUploadDefaults(field: DevFormField, type: DevFieldType = field.type): void {
  if (type !== 'image' && type !== 'file') return;
  if (!field.maxCount) field.maxCount = 9;
  if (!field.maxSize) field.maxSize = 10;
  field.acceptTypes = normalizeAcceptTypes(field, type);
  if (field.accept === undefined || field.accept === null) field.accept = '';
  if (field.tip === undefined || field.tip === null) field.tip = '';
}

/** 上传参数输入框清空时回落默认值，避免存 null */
export function setUploadCount(target: DevFormField | null, value: number | undefined): void {
  if (target) target.maxCount = value ?? 9;
}

export function setUploadSize(target: DevFormField | null, value: number | undefined): void {
  if (target) target.maxSize = value ?? 10;
}

/** 允许类型多选赋值：主字段与子表列共用 */
export function setAcceptTypes(
  target: { acceptTypes?: string[] | null } | null,
  value: string[],
): void {
  if (target) target.acceptTypes = value;
}

/** 二维码/条码是展示型控件，内容来自固定值或联动，不需要写库，可不绑定数据库字段 */
const DISPLAY_ONLY_TYPES: DevFieldType[] = ['qrcode', 'barcode'];
export function isDisplayOnly(type: DevFieldType): boolean {
  return DISPLAY_ONLY_TYPES.includes(type);
}

/** 高级控件：弹框选择器，属于输入型控件，必须绑定 varchar/text 数据库列 */
const PICKER_TYPES: DevFieldType[] = ['relationForm', 'dialogSelect', 'userSelect', 'roleSelect'];
export function isPickerType(type: DevFieldType): boolean {
  return PICKER_TYPES.includes(type);
}

/** 数据源内置的选择器（用户 / 角色）：不需要选择数据源、存储字段与列表字段 */
export function isBuiltinPickerType(type: DevFieldType): boolean {
  return type === 'userSelect' || type === 'roleSelect';
}

/** 拖入 / 读取 / 切换类型时补齐弹框选择器的默认配置 */
export function applyPickerDefaults(field: DevFormField): void {
  if (!isPickerType(field.type)) return;
  const builtin = isBuiltinPickerType(field.type);
  if (field.sourceId === undefined) field.sourceId = null;
  if (field.sourceName === undefined) field.sourceName = '';
  if (field.valueField === undefined) field.valueField = builtin ? 'id' : '';
  if (field.displayField === undefined) {
    field.displayField = builtin ? (field.type === 'userSelect' ? 'nickname' : 'name') : '';
  }
  if (field.listFields === undefined) field.listFields = [];
  if (field.multiple === undefined) field.multiple = false;
  // 内置源固定按关键词搜索（用户按账号/昵称，角色按名称），不需要配置
  if (field.keywordKey === undefined) field.keywordKey = builtin ? 'keyword' : '';
  if (field.pickerTitle === undefined) {
    field.pickerTitle = builtin ? (field.type === 'userSelect' ? '选择用户' : '选择角色') : '';
  }
  // 内置选择器的关键字段是固定语义：空串也补回默认值（旧 schema / 切类型残留）
  if (builtin) {
    if (!field.valueField) field.valueField = 'id';
    if (!field.displayField) field.displayField = field.type === 'userSelect' ? 'nickname' : 'name';
    if (!field.keywordKey) field.keywordKey = 'keyword';
    if (!field.pickerTitle) field.pickerTitle = field.type === 'userSelect' ? '选择用户' : '选择角色';
  }
}

/** 24 栅格占位：主表控件、子表组件、明细列共用 */
export function colSpan(item: { span?: number | null }): number {
  return item.span || 24;
}

/** 新控件的基础配置：textarea/switch/slider/二维码等按类型补默认值 */
export function applyTypeDefaults(field: DevFormField, type: DevFieldType): void {
  if (type === 'textarea') field.rows = 4;
  if (type === 'switch') field.defaultValue = false;
  if (type === 'slider') {
    field.min = 0;
    field.max = 100;
    field.step = 1;
  }
  if (type === 'qrcode' || type === 'barcode') {
    field.codeSource = 'fixed';
    field.codeValue = '';
    field.codeFields = [];
    field.codeSeparator = '';
  }
  applyUploadDefaults(field, type);
  applyDateFormatDefault(field, type);
}

export function createMappedField(column: SyncedColumn): DevFormField {
  const type = defaultType(column);
  const field: DevFormField = {
    id: newId(),
    type,
    label: column.comment || column.columnName,
    name: toCamel(column.columnName),
    columnName: column.columnName,
    placeholder: '',
    required: !column.nullable,
    disabled: false,
    clearable: true,
    // 24 栅格默认整行，控件宽度默认 100%
    span: 24,
    controlWidth: DEFAULT_CONTROL_WIDTH,
    options: defaultOptionsFor(type),
  };
  applyTypeDefaults(field, type);
  return field;
}

/** 没有空闲同类型字段时先落一个未绑定控件，等用户自己选列（下一步会统一校验） */
export function createUnboundField(type: DevFieldType, placeholderName: string): DevFormField {
  const field: DevFormField = {
    id: newId(),
    type,
    label: typeLabels[type],
    name: placeholderName,
    columnName: '',
    placeholder: '',
    required: false,
    disabled: false,
    clearable: true,
    span: 24,
    controlWidth: DEFAULT_CONTROL_WIDTH,
    options: defaultOptionsFor(type),
  };
  applyTypeDefaults(field, type);
  return field;
}

/** 控件栅格滑块：没有选中项时停在 24，写回时按两格对齐 */
export function spanModelOf(source: () => { span?: number | null } | null) {
  return computed<number>({
    get: () => {
      const target = source();
      if (!target) return 24;
      return Math.min(24, Math.max(2, colSpan(target)));
    },
    set: (value) => {
      const target = source();
      if (!target) return;
      target.span = Math.min(24, Math.max(2, Math.round(Number(value) / 2) * 2));
    },
  });
}

/** 新表单没填默认值时，画布预览用的初始值 */
export function defaultFor(field: DevFormField): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'switch') return false;
  if (field.type === 'checkbox') return [];
  if (field.type === 'slider') return field.min ?? 0;
  if (field.type === 'number' || field.type === 'date' || field.type === 'datetime') return null;
  return '';
}

/** 控件栅格的刻度：2-24，两格一跳，数字标在滑块下方 */
export const spanMarks: Record<number, string> = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => {
    const value = (index + 1) * 2;
    return [value, String(value)];
  }),
);
