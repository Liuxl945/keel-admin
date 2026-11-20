/**
 * 第 3 步「列表设计」：查询条件行、列表列行、列名候选与校验。
 */
import { computed, reactive, ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { DevColumnSource, DevFieldType, DevFormField, DevFormSchema, DevSubTableView } from '@/types/dev';
import type { SyncedColumn } from '@/types/dev-db';
import {
  newId,
  type ColumnOption,
  type ListColumnDraft,
  type QueryColumnDraft,
  type SubTableDraft,
} from './model';

export interface ListModelDeps {
  fields: Ref<DevFormField[]>;
  subtables: Ref<SubTableDraft[]>;
  businessColumns: Ref<SyncedColumn[]>;
  markDirty: () => void;
}

export function useListModel(deps: ListModelDeps) {
  const { fields, subtables, businessColumns, markDirty } = deps;

  const listConfig = reactive({
    queryFields: [] as string[],
    listFields: [] as string[],
    queryColumns: [] as QueryColumnDraft[],
    listColumns: [] as ListColumnDraft[],
    /** 明细展示方式：合并到列表 / 展开行嵌套表格 */
    subTableView: 'merge' as DevSubTableView,
  });

  const columnMap = computed(
    () => new Map(businessColumns.value.map((column) => [column.columnName, column])),
  );

  function columnKeyOf(item: {
    source: DevColumnSource;
    tableName?: string | null;
    columnName: string;
  }): string {
    return `${item.source}:${item.tableName || ''}:${item.columnName}`;
  }

  /** 列名候选：主表业务列 + 各子表已设计的明细字段（列表里可聚合展示子表信息） */
  const columnOptions = computed<ColumnOption[]>(() => {
    const items: ColumnOption[] = businessColumns.value.map((column) => ({
      value: columnKeyOf({ source: 'master', tableName: '', columnName: column.columnName }),
      label: `${column.comment || column.columnName}（${column.columnName}）`,
      source: 'master',
      tableName: '',
      columnName: column.columnName,
    }));
    for (const sub of subtables.value) {
      for (const column of sub.columns) {
        // 还没关联从表字段的明细列不参与列表设计
        if (!column.columnName) continue;
        items.push({
          value: columnKeyOf({
            source: 'subtable',
            tableName: sub.tableName,
            columnName: column.columnName,
          }),
          label: `${sub.label}-${column.label}（${column.columnName}）`,
          source: 'subtable',
          tableName: sub.tableName,
          columnName: column.columnName,
        });
      }
    }
    return items;
  });

  const columnOptionMap = computed(
    () => new Map(columnOptions.value.map((item) => [item.value, item])),
  );

  /** 列对应的控件类型：主表优先取表单字段的控件类型，子表取明细字段类型 */
  function columnTypeOf(item: {
    source: DevColumnSource;
    tableName?: string | null;
    columnName: string;
  }): DevFieldType | undefined {
    if (item.source === 'subtable') {
      const sub = subtables.value.find((entry) => entry.tableName === item.tableName);
      return sub?.columns.find((column) => column.columnName === item.columnName)?.type;
    }
    const field = fields.value.find((entry) => entry.columnName === item.columnName);
    if (field) return field.type;
    const column = columnMap.value.get(item.columnName);
    if (!column) return undefined;
    if (column.type === 'int' || column.type === 'decimal') return 'number';
    if (column.type === 'boolean') return 'switch';
    if (column.type === 'date') return 'date';
    if (column.type === 'datetime') return 'datetime';
    if (column.type === 'text') return 'textarea';
    return 'input';
  }

  /** 文本列默认「包含」，数字/日期/选择类默认「等于」 */
  function defaultOperatorFor(item: {
    source: DevColumnSource;
    tableName?: string | null;
    columnName: string;
  }): QueryColumnDraft['operator'] {
    const type = columnTypeOf(item);
    if (!type) return 'like';
    if (type === 'checkbox') return 'like';
    if (['number', 'switch', 'date', 'datetime', 'select', 'radio'].includes(type)) return 'eq';
    return 'like';
  }

  /** 表格里「字段」列：展示该列映射到哪个表单字段 / 明细字段 */
  function rowFieldLabel(item: {
    source: DevColumnSource;
    tableName?: string | null;
    columnName: string;
  }): string {
    if (item.source === 'subtable') {
      const sub = subtables.value.find((entry) => entry.tableName === item.tableName);
      const column = sub?.columns.find((entry) => entry.columnName === item.columnName);
      return column ? `${column.label}（${column.name}）` : '—';
    }
    const field = fields.value.find((entry) => entry.columnName === item.columnName);
    if (field) return `${field.label}（${field.name}）`;
    const column = columnMap.value.get(item.columnName);
    return column?.comment || item.columnName || '—';
  }

  function createQueryDraft(target: {
    source: DevColumnSource;
    tableName: string;
    columnName: string;
  }): QueryColumnDraft {
    return {
      key: newId(),
      columnName: target.columnName,
      source: target.source,
      tableName: target.tableName,
      operator: defaultOperatorFor(target),
      defaultValue: '',
      keyword: '',
      multiple: false,
      hidden: false,
    };
  }

  function createListDraft(target: {
    source: DevColumnSource;
    tableName: string;
    columnName: string;
  }): ListColumnDraft {
    return {
      key: newId(),
      columnName: target.columnName,
      source: target.source,
      tableName: target.tableName,
      sortable: false,
      fixed: '',
      align: 'left',
      width: null,
    };
  }

  function addQueryColumn(): void {
    const used = new Set(listConfig.queryColumns.map((item) => columnKeyOf(item)));
    const option = columnOptions.value.find((item) => !used.has(item.value));
    if (!option) {
      ElMessage.warning('没有可添加的字段了，请先在表单设计里补充字段');
      return;
    }
    listConfig.queryColumns.push(createQueryDraft(option));
    markDirty();
  }

  function addListColumn(): void {
    const used = new Set(listConfig.listColumns.map((item) => columnKeyOf(item)));
    const option = columnOptions.value.find((item) => !used.has(item.value));
    if (!option) {
      ElMessage.warning('没有可添加的字段了，请先在表单设计里补充字段');
      return;
    }
    listConfig.listColumns.push(createListDraft(option));
    markDirty();
  }

  function removeQueryColumn(index: number): void {
    listConfig.queryColumns.splice(index, 1);
    markDirty();
  }

  function removeListColumn(index: number): void {
    listConfig.listColumns.splice(index, 1);
    markDirty();
  }

  function changeQueryColumn(row: QueryColumnDraft, value: string): void {
    const option = columnOptionMap.value.get(value);
    if (!option) return;
    row.source = option.source;
    row.tableName = option.tableName;
    row.columnName = option.columnName;
    row.operator = defaultOperatorFor(option);
    markDirty();
  }

  function changeListColumn(row: ListColumnDraft, value: string): void {
    const option = columnOptionMap.value.get(value);
    if (!option) return;
    row.source = option.source;
    row.tableName = option.tableName;
    row.columnName = option.columnName;
    markDirty();
  }

  /** 表格行拖拽排序：拖到目标行即占用目标位置 */
  const columnDrag = ref<{ list: 'query' | 'list'; index: number } | null>(null);

  function onColumnDragStart(list: 'query' | 'list', index: number, event: DragEvent): void {
    columnDrag.value = { list, index };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  function onColumnDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function onColumnDrop(list: 'query' | 'list', index: number): void {
    const drag = columnDrag.value;
    columnDrag.value = null;
    if (!drag || drag.list !== list || drag.index === index) return;
    if (list === 'query') {
      const rows = listConfig.queryColumns;
      if (drag.index < 0 || drag.index >= rows.length) return;
      const [moved] = rows.splice(drag.index, 1);
      rows.splice(index, 0, moved);
    } else {
      const rows = listConfig.listColumns;
      if (drag.index < 0 || drag.index >= rows.length) return;
      const [moved] = rows.splice(drag.index, 1);
      rows.splice(index, 0, moved);
    }
    markDirty();
  }

  /** 子表被删掉后，引用它的查询/列表行一并清理 */
  function pruneListColumns(): void {
    const valid = new Set(columnOptions.value.map((item) => item.value));
    listConfig.queryColumns = listConfig.queryColumns.filter((item) => valid.has(columnKeyOf(item)));
    listConfig.listColumns = listConfig.listColumns.filter((item) => valid.has(columnKeyOf(item)));
  }

  /** 列对应的表单字段名（主表字段或明细字段），仅用于记录展示 */
  function fieldNameOf(item: {
    source: DevColumnSource;
    tableName?: string | null;
    columnName: string;
  }): string {
    if (item.source === 'subtable') {
      const sub = subtables.value.find((entry) => entry.tableName === item.tableName);
      return sub?.columns.find((entry) => entry.columnName === item.columnName)?.name ?? '';
    }
    return fields.value.find((field) => field.columnName === item.columnName)?.name ?? '';
  }

  /**
   * 草稿 → 兼容字段：主表列写入 list.queryFields/listFields。
   * 子表列不回写 sub.listFields，那份配置决定明细编辑器的列，语义不同不能覆盖。
   */
  function syncListFieldsFromColumns(): void {
    listConfig.queryFields = [
      ...new Set(
        listConfig.queryColumns
          .filter((item) => item.source === 'master')
          .map((item) => item.columnName),
      ),
    ];
    listConfig.listFields = [
      ...new Set(
        listConfig.listColumns.filter((item) => item.source === 'master').map((item) => item.columnName),
      ),
    ];
  }

  /** 列表设计底部提示：随明细展示方式变化 */
  const subtableListTip = computed(() => {
    if (listConfig.subTableView === 'merge') {
      const hasSubColumn = listConfig.listColumns.some((item) => item.source === 'subtable');
      return hasSubColumn
        ? '合并展示：一条主记录按明细行数占多行，主表单元格跨行合并，子表列逐行显示明细值。'
        : '合并展示：未选择子表列时会自动带上该子表的明细列；在「列名」里选子表字段可调整顺序与样式。';
    }
    return '展开展示：子表字段作为列表列时会聚合展示明细值；查询要求存在匹配明细。';
  });

  /** 还原第 3 步：优先用详细配置，旧表单按 queryFields/listFields（含子表）生成草稿 */
  function applyListConfig(list: DevFormSchema['list'] | undefined): void {
    listConfig.queryFields = [...(list?.queryFields ?? [])];
    listConfig.listFields = [...(list?.listFields ?? [])];
    listConfig.subTableView = list?.subtableView ?? 'merge';

    const queryColumns = list?.queryColumns ?? [];
    listConfig.queryColumns =
      queryColumns.length > 0
        ? queryColumns.map((item) => ({
            key: newId(),
            columnName: item.columnName,
            source: item.source ?? 'master',
            tableName: item.tableName ?? '',
            operator: item.operator ?? 'like',
            defaultValue:
              item.defaultValue === undefined || item.defaultValue === null
                ? ''
                : String(item.defaultValue),
            keyword: item.keyword ?? '',
            multiple: Boolean(item.multiple),
            hidden: Boolean(item.hidden),
          }))
        : [
            ...(list?.queryFields ?? []).map((columnName) =>
              createQueryDraft({ source: 'master', tableName: '', columnName }),
            ),
            ...subtables.value.flatMap((sub) =>
              (sub.queryFields ?? []).map((columnName) =>
                createQueryDraft({ source: 'subtable', tableName: sub.tableName, columnName }),
              ),
            ),
          ];

    const listColumns = list?.listColumns ?? [];
    listConfig.listColumns =
      listColumns.length > 0
        ? listColumns.map((item) => ({
            key: newId(),
            columnName: item.columnName,
            source: item.source ?? 'master',
            tableName: item.tableName ?? '',
            sortable: Boolean(item.sortable),
            fixed: item.fixed ?? '',
            align: item.align ?? 'left',
            width: item.width ?? null,
          }))
        : (list?.listFields ?? []).map((columnName) =>
            createListDraft({ source: 'master', tableName: '', columnName }),
          );
  }

  /** 第一次进入列表设计：默认把所有主表字段放进列表 */
  function fillDefaultListColumns(): void {
    listConfig.listColumns = businessColumns.value.map((column) =>
      createListDraft({ source: 'master', tableName: '', columnName: column.columnName }),
    );
    syncListFieldsFromColumns();
  }

  function validateStep3(): string | null {
    pruneListColumns();
    syncListFieldsFromColumns();
    if (listConfig.listColumns.length === 0) return '请至少选择一个列表字段';

    const valid = new Set(columnOptions.value.map((item) => item.value));
    const checkRows = (
      rows: Array<{ source: DevColumnSource; tableName?: string | null; columnName: string }>,
      label: string,
    ) => {
      const seen = new Set<string>();
      for (const row of rows) {
        if (!row.columnName) return `${label}存在未选择列名的行`;
        const key = columnKeyOf(row);
        if (!valid.has(key)) return `${label}「${row.columnName}」已不存在，请重新选择`;
        if (seen.has(key)) return `${label}「${row.columnName}」重复`;
        seen.add(key);
      }
      return null;
    };
    return (
      checkRows(listConfig.queryColumns, '查询字段') ?? checkRows(listConfig.listColumns, '列表字段')
    );
  }

  return {
    listConfig,
    columnMap,
    columnKeyOf,
    columnOptions,
    columnOptionMap,
    columnTypeOf,
    defaultOperatorFor,
    rowFieldLabel,
    createQueryDraft,
    createListDraft,
    addQueryColumn,
    addListColumn,
    removeQueryColumn,
    removeListColumn,
    changeQueryColumn,
    changeListColumn,
    columnDrag,
    onColumnDragStart,
    onColumnDragOver,
    onColumnDrop,
    pruneListColumns,
    fieldNameOf,
    syncListFieldsFromColumns,
    subtableListTip,
    applyListConfig,
    fillDefaultListColumns,
    validateStep3,
  };
}

export type ListModel = ReturnType<typeof useListModel>;
