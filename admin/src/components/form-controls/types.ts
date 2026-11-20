/**
 * 公共控件库的最小字段契约。
 *
 * 这里刻意不引用 `@/types/dev` 等业务类型：任何页面只要提供满足该结构的
 * 字段配置，就能复用这些控件；表单设计器只是其中一种调用方。
 */
export interface CommonField {
  /** 控件类型标识（字符串，避免公共库依赖业务侧的类型枚举） */
  type?: string;
  label?: string;
  placeholder?: string;
  rows?: number | null;
  disabled?: boolean;
  clearable?: boolean;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  /** 日期/时间控件的显示格式（dayjs token）；datetime 底层仍存完整时间戳，空值按类型兜底 */
  dateFormat?: string | null;
  options?: Array<{ label: string; value: string }>;
  /** 二维码/条码：manual 手动输入 / fixed 固定值 / link 关联字段 */
  codeSource?: string | null;
  codeValue?: string | null;
  codeFields?: string[] | null;
  codeSeparator?: string | null;

  /* ---- 图片 / 文件上传 ---- */
  /** 最大上传数，默认 9 */
  maxCount?: number | null;
  /** 单文件大小上限（MB），0 表示不限制 */
  maxSize?: number | null;
  /** 允许的文件类型（accept 语法，如 image/*,.pdf）；作为自定义后缀与 acceptTypes 合并 */
  accept?: string | null;
  /** 允许类型多选（image/video/audio/excel/word/ppt/pdf/text/archive），空数组表示不限 */
  acceptTypes?: string[] | null;
  /** 上传提示文案，留空按「最多 N 个、单个不超过 M MB」自动生成 */
  tip?: string | null;

  /* ---- 弹框选择器（关联表单 / 弹框选择 / 用户 / 角色）---- */
  /**
   * 内置数据源：用户选择 / 角色选择没有 sourceId，
   * 由调用方注入固定的取数回调，弹框本身不判断业务类型。
   */
  builtinSource?: 'user' | 'role' | null;
  /** 数据源 id：关联表单=已发布表单 id，弹框选择=数据接口 id */
  sourceId?: number | null;
  /** 数据源名称，仅用于配置回显 */
  sourceName?: string | null;
  /** 存储字段：结果行里取哪一列作为写入值 */
  valueField?: string | null;
  /** 回显字段：结果行里取哪一列作为显示文本 */
  displayField?: string | null;
  /** 弹框列表动态展示的列 */
  listFields?: DataPickerColumn[] | null;
  /** 是否允许多选 */
  multiple?: boolean;
  /** 关键字搜索对应的数据源字段名 / 接口参数名 */
  keywordKey?: string | null;
  /** 搜索框占位文案，未设置时按 keywordKey 生成 */
  keywordPlaceholder?: string | null;
  /** 弹框标题 */
  pickerTitle?: string | null;
}

export interface UploadResult {
  /** 上传成功后可用于展示和保存的文件地址 */
  url: string;
  name?: string;
}

/** 上传进度回调：0-100 的整数，供上传控件渲染进度条 */
export type UploadProgressHandler = (percent: number) => void;

/** 上传由调用方注入，公共控件本身不依赖任何业务 API */
export type UploadHandler = (file: File, onProgress?: UploadProgressHandler) => Promise<UploadResult>;

/** 弹框列表的一列：key 为数据源结果行里的字段名，label 为表头 */
export interface DataPickerColumn {
  key: string;
  label: string;
}

/** 弹框拉取一页数据的请求参数 */
export interface DataListQuery {
  /** 数据源 id */
  sourceId: number;
  page: number;
  pageSize: number;
  /** 搜索词；未配置搜索字段时为空 */
  keyword?: string;
  /** 搜索词对应的数据源字段名 / 接口参数名 */
  keywordKey?: string | null;
}

export interface DataListResult {
  rows: Record<string, unknown>[];
  total: number;
}

/** 拉数由调用方注入：公共控件不引用表单预览 / 数据接口等业务 API */
export type DataFetchHandler = (query: DataListQuery) => Promise<DataListResult>;
