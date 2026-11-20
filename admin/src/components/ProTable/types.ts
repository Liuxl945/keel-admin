export interface ProTableColumn {
  /**
   * 特殊列：勾选 / 序号 / 展开；留空为普通数据列。
   * 展开列（expand）的内容由 slot 提供，作用域参数里带 row。
   */
  type?: 'selection' | 'index' | 'expand';
  prop?: string;
  label?: string;
  width?: number | string;
  minWidth?: number | string;
  fixed?: boolean | 'left' | 'right';
  align?: 'left' | 'center' | 'right';
  /** 仅表头对齐，优先于 align；对齐分组表头（一级）时用它 */
  headerAlign?: 'left' | 'center' | 'right';
  sortable?: boolean | 'custom';
  /** 后端排序字段映射，默认用 prop */
  sortParam?: string;
  /** 自定义插槽名，列内容由页面提供 */
  slot?: string;
  showOverflowTooltip?: boolean;
  formatter?: (row: any, column: any, value: any, index: number) => string;
  /**
   * 分组表头：有 children 时该列只作为一级表头（`label` 显示为分组名），
   * 实际数据列是 children 里的叶子列（二级表头），叶子列支持上面全部属性。
   */
  children?: ProTableColumn[];
}

export interface SearchOption {
  label: string;
  value: string | number;
}

export interface SearchItem {
  prop: string;
  label?: string;
  type?: 'input' | 'select' | 'date' | 'daterange';
  placeholder?: string;
  options?: SearchOption[];
  width?: number | string;
  /** 默认 true；必选筛选项设为 false */
  clearable?: boolean;
  /** 日期区间提交到后端的字段名 */
  startProp?: string;
  endProp?: string;
  /** 下拉是否多选，多选时提交数组 */
  multiple?: boolean;
  /** 初始值：挂载时写入查询表单，重置时恢复 */
  defaultValue?: string | number | boolean | Array<string | number> | null;
  /** 隐藏：不渲染输入控件，但仍按初始值提交（用于固定过滤条件） */
  hidden?: boolean;
  /** 下拉切换后立即触发查询（无需点「查询」按钮），适合必选且切换频率低的筛选项 */
  autoSearch?: boolean;
}

export interface ProTableResult<T = any> {
  list: T[];
  total: number;
  page?: number;
  pageSize?: number;
}
