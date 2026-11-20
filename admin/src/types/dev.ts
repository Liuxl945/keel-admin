export type DevFieldType =
  | 'input'
  | 'textarea'
  | 'number'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'datetime'
  | 'switch'
  | 'slider'
  | 'color'
  | 'file'
  | 'image'
  | 'qrcode'
  | 'barcode'
  | 'relationForm'
  | 'dialogSelect'
  | 'userSelect'
  | 'roleSelect';

/** 二维码 / 条码的内容来源：手动输入、固定值、关联其他字段 */
export type DevCodeSource = 'manual' | 'fixed' | 'link';

export type DevFormStatus = 'DRAFT' | 'PUBLISHED';
export type DevFormLabelPosition = 'left' | 'right' | 'top';
/** Element Plus 表单控件尺寸 */
export type DevFormSize = 'large' | 'default' | 'small';

/**
 * 表单尺寸：同时决定控件尺寸与默认弹窗宽度。
 * small=紧凑（small/720px）、medium=标准（default/900px）、large=宽松（large/1100px）。
 */
export type DevFormSizePreset = 'small' | 'medium' | 'large';

/** 弹窗类型：居中弹窗 / 右侧抽屉 / 全屏 */
export type DevFormDialogType = 'center' | 'right' | 'fullscreen';

export interface DevFieldOption {
  label: string;
  value: string;
}

/** 弹框选择器（关联表单 / 弹框选择）的列表列：key 为数据源结果行里的字段名 */
export interface DevDataPickerColumn {
  key: string;
  label: string;
}

export interface DevFormField {
  id: string;
  type: DevFieldType;
  label: string;
  name: string;
  /** 关联的数据库列 */
  columnName?: string | null;
  placeholder?: string;
  required: boolean;
  disabled: boolean;
  clearable: boolean;
  /** Element Plus 24 栅格宽度 */
  span: number;
  /** 标题宽度（px），为空跟随表单级 labelWidth */
  labelWidth?: number | null;
  /** 控件宽度：`100%`（相对所在栅格，默认）或 `320px`（固定像素） */
  controlWidth?: string | null;
  options: DevFieldOption[];
  defaultValue?: string | number | boolean | string[] | null;
  rows?: number;
  min?: number;
  max?: number;
  /** 滑块步长 */
  step?: number;
  /** 日期/日期时间控件的显示与存储格式（dayjs token），空值按控件类型兜底 */
  dateFormat?: string | null;
  /** 二维码/条码内容来源，缺省按手动输入处理 */
  codeSource?: DevCodeSource | null;
  /** codeSource=fixed 时的固定内容 */
  codeValue?: string | null;
  /** codeSource=link 时关联的本表单字段名（主表字段或同一子表内的明细列） */
  codeFields?: string[] | null;
  /** codeSource=link 时多个字段值的拼接分隔符 */
  codeSeparator?: string | null;

  /* ---- 图片上传 / 文件上传 ---- */
  /** 最大上传数，默认 9 */
  maxCount?: number | null;
  /** 单文件大小上限（MB），默认 10 */
  maxSize?: number | null;
  /** 允许的文件类型（accept 语法，如 image/*,.pdf），作为自定义后缀 */
  accept?: string | null;
  /** 允许类型多选（image/video/audio/excel/word/ppt/pdf/text/archive），空数组表示不限 */
  acceptTypes?: string[] | null;
  /** 上传提示文案，留空按数量/大小自动生成 */
  tip?: string | null;

  /* ---- 关联表单 / 弹框选择：弹框选择器配置 ---- */
  /** 数据源 id：关联表单=已发布表单 id，弹框选择=数据接口 id */
  sourceId?: number | null;
  /** 数据源名称，仅用于配置回显 */
  sourceName?: string | null;
  /** 存储字段：结果行里取哪一列作为写入值 */
  valueField?: string | null;
  /** 回显字段：结果行里取哪一列作为显示文本 */
  displayField?: string | null;
  /** 弹框列表动态展示的列 */
  listFields?: DevDataPickerColumn[] | null;
  /** 是否允许多选；单选存 {v,l}，多选存 [{v,l}] */
  multiple?: boolean;
  /** 关键字搜索对应的数据源字段名 / 接口参数名 */
  keywordKey?: string | null;
  /** 弹框标题 */
  pickerTitle?: string | null;
}

/** 查询条件类型：包含 / 等于 / 大于 / 大于等于 / 小于 / 小于等于 */
export type DevQueryOperator = 'like' | 'eq' | 'gt' | 'gte' | 'lt' | 'lte';

/** 列来源：主表列，或某张子表（明细）的列 */
export type DevColumnSource = 'master' | 'subtable';

export type DevListFixed = '' | 'left' | 'right';
export type DevListAlign = 'left' | 'center' | 'right';

/** 列表页查询条件（第 3 步「查询字段」表格的一行） */
export interface DevQueryColumn {
  /** 数据库列名（主表列或子表列） */
  columnName: string;
  source: DevColumnSource;
  /** source='subtable' 时必填：所属子表 */
  tableName?: string | null;
  /** 对应的表单字段 / 明细字段名，用于展示与参数映射兜底 */
  field?: string;
  operator: DevQueryOperator;
  defaultValue?: string | number | boolean | null;
  /** 查询框提示文案（关键词） */
  keyword?: string;
  /** 是否多选（多值时按 IN 匹配） */
  multiple: boolean;
  /** 是否隐藏：不在查询区展示，但默认值仍然参与过滤 */
  hidden: boolean;
}

/** 列表列（第 3 步「列表字段」表格的一行） */
export interface DevListColumn {
  columnName: string;
  source: DevColumnSource;
  /** source='subtable' 时必填：所属子表，列表里聚合展示明细值 */
  tableName?: string | null;
  field?: string;
  sortable: boolean;
  fixed: DevListFixed;
  align: DevListAlign;
  /** 列宽（px），为空按内容自适应 */
  width?: number | null;
}

/** 明细在列表页的展示方式：合并到主表列（主表单元格跨行合并）/ 展开行嵌套表格 */
export type DevSubTableView = 'merge' | 'expand';

export interface DevFormListConfig {
  /** 查询区展示的数据库列（按数组顺序） */
  queryFields: string[];
  /** 列表列展示的数据库列（按数组顺序） */
  listFields: string[];
  /** 查询条件的详细配置；缺省时按 queryFields 兜底 */
  queryColumns?: DevQueryColumn[];
  /** 列表列的详细配置；缺省时按 listFields 兜底 */
  listColumns?: DevListColumn[];
  /** 有子表时的明细展示方式，缺省为 merge */
  subtableView?: DevSubTableView;
}

export type DevFormTableRole = 'MASTER' | 'SLAVE';

/**
 * 表单关联的数据表：一张主表承载表单字段与列表，
 * 其余从表通过外键指向主表主键（一对多明细）。
 */
export interface DevFormTableRef {
  role: DevFormTableRole;
  tableName: string;
  tableComment?: string;
  /** 从表必填：从表上的外键列 */
  foreignKey?: string | null;
  /** 从表必填：被引用的主表列，与后端一致要求是主键 */
  masterColumn?: string | null;
}

/** 明细（从表）里的一个字段，控件类型与主表字段同源 */
/** 明细（子表）列：与主表控件共用一套字段配置，另加「是否在明细表单中展示」 */
export interface DevSubTableColumn extends DevFormField {
  /** 从表列名；未关联时为空串 */
  columnName: string;
  /** 是否在明细表单中展示；关掉后只作为列表列/查询条件 */
  visible: boolean;
}

export type DevSubTableMode = 'table' | 'dialog';

/**
 * 子表设计：把一张从表拖成表单里的明细区块，字段即从表列。
 * foreignKey / masterColumn 与 tables 里的 SLAVE 声明保持一致（基础设计是唯一来源）。
 */
export interface DevFormSubTable {
  id: string;
  tableName: string;
  label: string;
  foreignKey: string | null;
  masterColumn: string | null;
  /** 明细区块在主子表单中的 24 栅格宽度 */
  span: number;
  /** 录入方式：表格行内编辑 / 弹窗编辑 */
  mode: DevSubTableMode;
  columns: DevSubTableColumn[];
  /** 列表页按明细字段过滤主表记录 */
  queryFields: string[];
  /** 明细列表展示的列 */
  listFields: string[];
}

export interface DevFormSchema {
  columns: 1 | 2;
  labelWidth: number;
  labelPosition: DevFormLabelPosition;
  /** el-form 的控件尺寸；由 formSize 派生，保留以兼容旧 schema */
  size: DevFormSize;
  disabled: boolean;
  labelSuffix: string;
  hideRequiredAsterisk: boolean;
  showMessage: boolean;
  statusIcon: boolean;
  /** 表单尺寸（小/中/大）：控件尺寸 + 默认弹窗宽度档位；旧表单缺省时按 size 推导 */
  formSize?: DevFormSizePreset;
  /** 弹窗类型：居中弹窗 / 右侧抽屉 / 全屏；旧表单缺省按 center */
  dialogType?: DevFormDialogType;
  /** 表单宽度（px）：为空表示跟随 formSize；全屏时忽略 */
  dialogWidth?: number | string | null;
  fields: DevFormField[];
  list: DevFormListConfig;
  /** 关联表配置；旧表单没有该字段，读取时按空数组处理 */
  tables?: DevFormTableRef[];
  /** 子表设计（一张从表一个明细区块）；旧表单没有该字段，按空数组处理 */
  subtables?: DevFormSubTable[];
  /**
   * 画布排版顺序：fields + subtables 的 id 混排，控件可以插在子表前后。
   * 旧表单没有该字段，渲染时回落为「主表字段在前、子表在后」
   */
  layout?: string[];
}

export interface DevFormSummary {
  id: number;
  name: string;
  formKey: string;
  description: string | null;
  connectionId: number | null;
  tableName: string | null;
  status: DevFormStatus;
  version: number;
  publishedAt: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** 已生成的业务菜单，未生成时为 null（仅列表接口返回） */
  menuId?: number | null;
  menuPath?: string | null;
}

export interface DevFormDetail extends DevFormSummary {
  schema: DevFormSchema;
}

export interface DevFormCodeFile {
  name: string;
  language: 'ts' | 'vue' | 'sql' | 'markdown';
  content: string;
}

export interface DevFormCodeMenuState {
  exists: boolean;
  menuId: number | null;
  name: string | null;
  /** 生成页应当使用的菜单路径与组件 */
  path: string;
  component: string;
  /** 已有菜单指向别的组件（例如仍在使用 biz/runtime/index） */
  componentMismatch: boolean;
  /** 已有菜单当前的组件与路径 */
  currentComponent: string | null;
  currentPath: string | null;
  /** 页面权限标识，如 biz_ddlb:list */
  perm: string;
  parentId: number | null;
}

export interface DevFormCodeResult {
  formId: number;
  formKey: string;
  formName: string;
  status: DevFormStatus;
  version: number;
  generatedAt: string;
  files: DevFormCodeFile[];
  menu: DevFormCodeMenuState;
}
