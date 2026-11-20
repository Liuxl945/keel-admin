<script setup lang="ts">
defineOptions({ name: 'FormPreviewTable' });

import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import { getDevForm } from '@/api/dev-form';
import {
  createPreviewRecord,
  deletePreviewRecord,
  getPreviewRecordDetails,
  listPreviewRecords,
  updatePreviewRecord,
} from '@/api/dev-form-preview';
import type {
  DevFieldType,
  DevFormField,
  DevFormSchema,
  DevFormSubTable,
  DevListColumn,
  DevQueryColumn,
  DevSubTableColumn,
  DevSubTableView,
} from '@/types/dev';
import { formatByPattern } from '@/utils/datetime';
import {
  formatDataPickerCell,
  formatDataPickerAggregatedCell,
  formatSmartCell,
  formatUploadCell,
  dateFormatOf,
} from '@/components/form-controls';
import { useUserStore } from '@/stores/user';
import UploadCell from '@/components/form-controls/UploadCell.vue';
import FieldControl from './FieldControl.vue';
import { controlBoxStyle, labelWidthOf } from './field-style';
import { formWidthOf, elSizeOf, normalizeFormSize } from './form-dialog';
import SubTableEditor from './SubTableEditor.vue';
import SubTableNested from './SubTableNested.vue';
import { clearSubTableDetailCache } from './subtable-detail-cache';
import {
  detailColumnsOf,
  subTablePayload,
  subTableValidateRows,
  type SubTableRow,
} from './subtable-helper';

const props = defineProps<{
  formId: number;
}>();

const userStore = useUserStore();
const loading = ref(false);
const schema = ref<DevFormSchema | null>(null);
const formName = ref('');
const formKey = ref('');
/** 表单被删除或下线时给出明确原因，避免误判成「没有字段」 */
const loadError = ref('');

/**
 * 写权限：优先看菜单生成时创建的 biz_<form_key>:<action>，
 * 同时兼容历史 dev_form:update 授权（设计器/预览调试仍在用）。
 */
function canDo(action: 'create' | 'update' | 'delete'): boolean {
  if (formKey.value && userStore.hasPermission(`biz_${formKey.value}:${action}`)) return true;
  return userStore.hasPermission('dev_form:update');
}

const canCreate = computed(() => canDo('create'));
const canUpdate = computed(() => canDo('update'));
const canDelete = computed(() => canDo('delete'));

const schemaFields = computed<DevFormField[]>(() => schema.value?.fields ?? []);
const subTables = computed<DevFormSubTable[]>(() => schema.value?.subtables ?? []);

/** 主表弹窗里二维码/条码联动来源标题：只映射主表字段，避免与子表同名字段混淆 */
const codeFieldLabels = computed<Record<string, string>>(() => {
  const labels: Record<string, string> = {};
  for (const field of schemaFields.value) {
    if (field.name) labels[field.name] = field.label || field.name;
  }
  return labels;
});

/** 弹窗排版：按设计器保存的 layout 把控件和子表区块混排；旧表单回落「字段在前、子表在后」 */
const dialogItems = computed<Array<{ kind: 'field' | 'subtable'; id: string; field?: DevFormField; sub?: DevFormSubTable }>>(() => {
  const fieldMap = new Map(schemaFields.value.map((field) => [field.id, field]));
  const subMap = new Map(subTables.value.map((sub) => [sub.id, sub]));
  const items: Array<{ kind: 'field' | 'subtable'; id: string; field?: DevFormField; sub?: DevFormSubTable }> = [];
  const seen = new Set<string>();
  const push = (kind: 'field' | 'subtable', id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    if (kind === 'field') items.push({ kind, id, field: fieldMap.get(id) });
    else items.push({ kind, id, sub: subMap.get(id) });
  };
  for (const id of schema.value?.layout ?? []) {
    if (fieldMap.has(id)) push('field', id);
    else if (subMap.has(id)) push('subtable', id);
  }
  for (const field of schemaFields.value) push('field', field.id);
  for (const sub of subTables.value) push('subtable', sub.id);
  return items;
});

/** 明细展示方式：merge=主表列与子表列合并成一张表（主表单元格跨行合并） */
const subTableView = computed<DevSubTableView>(() => schema.value?.list?.subtableView ?? 'merge');
/** 有子表且选择合并展示时才拍平，否则维持主表一行 + 展开行嵌套表格 */
const isMergeView = computed(() => subTables.value.length > 0 && subTableView.value === 'merge');

const fieldByColumn = computed(() => {
  const map = new Map<string, DevFormField>();
  for (const field of schemaFields.value) {
    if (field.columnName) map.set(field.columnName, field);
  }
  return map;
});

function toCamel(value: string): string {
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

function fieldOf(columnName: string): DevFormField | undefined {
  return fieldByColumn.value.get(columnName);
}
function propOf(columnName: string): string {
  return fieldOf(columnName)?.name || toCamel(columnName);
}
function labelOf(columnName: string): string {
  return fieldOf(columnName)?.label || columnName;
}
function optionsOf(field?: DevFormField): Array<{ label: string; value: string | number }> {
  return (field?.options ?? []).map((option) => ({ label: option.label, value: option.value }));
}

/** 子表列 id：与后端 previewSubQueryKey 一致：sub_<表名>_<列名> */
function subColumnKey(tableName: string, columnName: string): string {
  return `sub_${tableName}_${columnName}`;
}

function subTableOf(tableName?: string | null): DevFormSubTable | undefined {
  if (!tableName) return undefined;
  return subTables.value.find((sub) => sub.tableName === tableName);
}

function subColumnLabel(item: DevQueryColumn | DevListColumn): string {
  const sub = subTableOf(item.tableName);
  const column = sub?.columns.find((entry) => entry.columnName === item.columnName);
  return `${sub?.label ?? item.tableName ?? ''}-${column?.label ?? item.columnName}`;
}

/** 查询条件：优先读详细配置，旧表单回落到 queryFields（含子表 queryFields） */
const queryColumns = computed<DevQueryColumn[]>(() => {
  const list = schema.value?.list;
  if (!list) return [];
  if ((list.queryColumns ?? []).length > 0) return list.queryColumns as DevQueryColumn[];

  const items: DevQueryColumn[] = (list.queryFields ?? []).map((columnName) => ({
    columnName,
    source: 'master',
    field: fieldOf(columnName)?.name ?? toCamel(columnName),
    operator: 'like',
    multiple: false,
    hidden: false,
  }));
  for (const sub of subTables.value) {
    for (const columnName of sub.queryFields ?? []) {
      const column = sub.columns.find((entry) => entry.columnName === columnName);
      if (!column) continue;
      items.push({
        columnName,
        source: 'subtable',
        tableName: sub.tableName,
        field: column.name,
        operator: 'like',
        multiple: false,
        hidden: false,
      });
    }
  }
  return items;
});

const listColumns = computed<DevListColumn[]>(() => {
  const list = schema.value?.list;
  if (!list) return [];
  if ((list.listColumns ?? []).length > 0) return list.listColumns as DevListColumn[];
  return (list.listFields ?? []).map((columnName) => ({
    columnName,
    source: 'master',
    field: fieldOf(columnName)?.name ?? toCamel(columnName),
    sortable: false,
    fixed: '',
    align: 'left',
    width: null,
  }));
});

/**
 * 合并展示的列：主表列在前，子表列在后。
 * 设计器里没勾选任何子表列时自动补上明细列，否则合并模式只剩主表列、看不出明细。
 */
const mergeListColumns = computed<DevListColumn[]>(() => {
  const base = listColumns.value;
  if (base.some((item) => item.source === 'subtable')) return base;

  const extra: DevListColumn[] = [];
  for (const sub of subTables.value) {
    // 顺序跟设计器里明细列的拖拽顺序，listFields 只决定显示哪些
    const names = detailColumnsOf(sub).map((column) => column.columnName);
    for (const columnName of names) {
      const source = (sub.columns ?? []).find((column) => column.columnName === columnName);
      extra.push({
        columnName,
        source: 'subtable',
        tableName: sub.tableName,
        field: source?.name,
        sortable: false,
        fixed: '',
        align: 'left',
        width: null,
      });
    }
  }
  return [...base, ...extra];
});

/** 实际渲染的列表列：合并模式用补全后的列，展开模式仍按设计配置 */
const renderedListColumns = computed<DevListColumn[]>(() =>
  isMergeView.value ? mergeListColumns.value : listColumns.value,
);

/** 把查询条件配置翻译成 ProTable 的搜索项：类型随字段控件走，条件类型只影响后端匹配 */
function searchControlOf(
  type: DevFieldType | undefined,
  options: Array<{ label: string; value: string | number }> | undefined,
  item: DevQueryColumn,
): Partial<SearchItem> {
  const base: Partial<SearchItem> = {
    hidden: item.hidden,
    ...(item.defaultValue !== undefined && item.defaultValue !== null
      ? { defaultValue: item.defaultValue as SearchItem['defaultValue'] }
      : {}),
    ...(item.keyword ? { placeholder: item.keyword } : {}),
  };
  if (type === 'date' || type === 'datetime') return { ...base, type: 'date' };
  if (type === 'switch') {
    return {
      ...base,
      type: 'select',
      options: [
        { label: '是', value: 'true' },
        { label: '否', value: 'false' },
      ],
    };
  }
  if ((type === 'select' || type === 'radio' || type === 'checkbox') && options?.length) {
    return { ...base, type: 'select', options, ...(item.multiple ? { multiple: true } : {}) };
  }
  return base;
}

const searchItems = computed<SearchItem[]>(() =>
  queryColumns.value.map((item) => {
    if (item.source === 'subtable') {
      const sub = subTableOf(item.tableName);
      const column = sub?.columns.find((entry) => entry.columnName === item.columnName);
      return {
        prop: subColumnKey(item.tableName ?? '', item.columnName),
        label: subColumnLabel(item),
        ...searchControlOf(column?.type, undefined, item),
      };
    }
    const field = fieldOf(item.columnName);
    return {
      prop: field?.name || toCamel(item.columnName),
      label: field?.label || item.columnName,
      ...searchControlOf(field?.type, optionsOf(field), item),
    };
  }),
);

function optionLabel(field: DevFormField | undefined, value: unknown): string {
  const matched = (field?.options ?? []).find((option) => String(option.value) === String(value));
  return matched?.label ?? String(value);
}

function formatCell(value: unknown, field?: DevFormField, row?: Record<string, any>): string {
  if (value === null || value === undefined || value === '') return '-';
  // 关联表单 / 弹框选择：优先用预览接口返回的显示文本，前端解析只作兼容兜底
  const label = field?.name && row ? row[`${field.name}Label`] : undefined;
  if (typeof label === 'string' && label) return label;
  const pickerText = formatDataPickerCell(value, field?.type);
  if (pickerText !== null) return pickerText;
  if (field?.type === 'switch') return value ? '是' : '否';
  if (field?.type === 'date' || field?.type === 'datetime') {
    return formatByPattern(value as string, dateFormatOf(field));
  }
  // 图片/文件：多文件存 JSON 数组，列表还原成文件名
  if (field?.type === 'image' || field?.type === 'file') return formatUploadCell(value);
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => optionLabel(field, item)).join('、') : '-';
  }
  if (field?.options?.length) return optionLabel(field, value);
  return String(value);
}

/** 合并展示时，子表列是当前明细行的真实值，按明细字段类型格式化 */
function formatSubCell(value: unknown, column?: DevSubTableColumn, row?: Record<string, any>): string {
  if (value === null || value === undefined || value === '') return '-';
  const label = column?.name && row ? row[`${column.name}Label`] : undefined;
  if (typeof label === 'string' && label) return label;
  const pickerText = formatDataPickerCell(value, column?.type);
  if (pickerText !== null) return pickerText;
  if (!column) return String(value);
  if (column.type === 'switch') return value ? '是' : '否';
  if (column.type === 'date' || column.type === 'datetime') {
    return formatByPattern(value as string, dateFormatOf(column));
  }
  if (column.type === 'image' || column.type === 'file') return formatUploadCell(value);
  if (Array.isArray(value)) return value.length > 0 ? value.join('、') : '-';
  return String(value);
}

/** 展开展示时，子表列是后端拼好的文本；弹框选择列逐段还原成回显文本 */
function formatAggregated(
  value: unknown,
  column?: DevSubTableColumn,
  row?: Record<string, any>,
  prop?: string,
): string {
  if (value === null || value === undefined || value === '') return '-';
  const label = prop && row ? row[`${prop}Label`] : undefined;
  if (typeof label === 'string' && label) return label;
  const pickerText = formatDataPickerAggregatedCell(value, column?.type);
  if (pickerText !== null) return pickerText;
  // 聚合列是后端用 ', ' 拼接的多行值，时间列逐段格式化
  if (column?.type === 'date' || column?.type === 'datetime') {
    return String(value)
      .split(', ')
      .map((part) => formatSmartCell(part))
      .join('、');
  }
  // 图片/文件聚合：每段可能是单 URL 或多文件 JSON 数组，逐段还原成文件名
  if (column?.type === 'image' || column?.type === 'file') {
    const names = String(value)
      .split(', ')
      .map((part) => formatUploadCell(part))
      .filter((text) => text && text !== '-');
    return names.length > 0 ? names.join('、') : '-';
  }
  return String(value);
}

/** 图片/文件列走插槽渲染（缩略图 / 下载链接），行为按字段类型判断 */
function isUploadType(type?: DevFieldType): type is 'image' | 'file' {
  return type === 'image' || type === 'file';
}

/** 插槽名按列标识拼接，避免和内置插槽（indexCell / subDetail / actions）冲突 */
function uploadSlotName(prop: string): string {
  return `upload_${prop}`;
}

interface UploadSlot {
  name: string;
  prop: string;
  type: 'image' | 'file';
  /** 子表展开视图的值是聚合文本，需要逐段解析 */
  aggregated: boolean;
}

const uploadSlots = computed<UploadSlot[]>(() => {
  const slots: UploadSlot[] = [];
  for (const item of renderedListColumns.value) {
    if (item.source === 'subtable') {
      const column = subTableOf(item.tableName)?.columns.find(
        (entry) => entry.columnName === item.columnName,
      );
      const type = column?.type;
      if (!isUploadType(type)) continue;
      const prop = subColumnKey(item.tableName ?? '', item.columnName);
      slots.push({
        name: uploadSlotName(prop),
        prop,
        type,
        aggregated: !isMergeView.value,
      });
      continue;
    }
    const field = fieldOf(item.columnName);
    const type = field?.type;
    if (!isUploadType(type)) continue;
    const prop = propOf(item.columnName);
    slots.push({ name: uploadSlotName(prop), prop, type, aggregated: false });
  }
  return slots;
});

/** 一列配置 → ProTable 列：宽度/冻结/对齐/排序都来自第 3 步设计 */
function columnOf(item: DevListColumn, withTablePrefix = false): ProTableColumn {
  const fixed = item.fixed === 'left' || item.fixed === 'right' ? item.fixed : undefined;
  const width = item.width ?? undefined;
  if (item.source === 'subtable') {
    const sub = subTableOf(item.tableName);
    const column = sub?.columns.find((entry) => entry.columnName === item.columnName);
    const prop = subColumnKey(item.tableName ?? '', item.columnName);
    return {
      prop,
      // 合并表头时二级只显示字段名（表名在一级表头），单列时才带表名前缀
      label: withTablePrefix
        ? subColumnLabel(item)
        : (column?.label ?? item.columnName),
      ...(width ? { width } : { minWidth: 160 }),
      align: item.align,
      ...(fixed ? { fixed } : {}),
      // 子表列不参与后端排序：合并展示时按明细行，展开展示时是聚合文本
      sortable: false,
      // 上传列里有缩略图/链接，不要强制单行省略
      showOverflowTooltip: !isUploadType(column?.type),
      ...(isUploadType(column?.type) ? { slot: uploadSlotName(prop) } : {}),
      formatter: (row: any, _column: any, value: any) =>
        isMergeView.value
          ? formatSubCell(value, column, row)
          : formatAggregated(value, column, row, subColumnKey(item.tableName ?? '', item.columnName)),
    };
  }
  const field = fieldOf(item.columnName);
  const prop = propOf(item.columnName);
  return {
    prop,
    label: labelOf(item.columnName),
    ...(width ? { width } : { minWidth: field?.type === 'textarea' ? 220 : 140 }),
    align: item.align,
    ...(fixed ? { fixed } : {}),
    ...(item.sortable ? { sortable: 'custom' as const, sortParam: item.columnName } : { sortable: false }),
    showOverflowTooltip: !isUploadType(field?.type),
    ...(isUploadType(field?.type) ? { slot: uploadSlotName(prop) } : {}),
    formatter: (_row: any, _column: any, value: any) => formatCell(value, field),
  };
}

/**
 * 数据列：同一张子表连续的几列合并成两级表头（一级 = 子表标题，二级 = 明细字段），
 * 主表列保持单级；子表只占一列时不合并，仍用「表名-字段」避免重名歧义。
 */
function bodyColumns(): ProTableColumn[] {
  const result: ProTableColumn[] = [];
  let bucket: ProTableColumn[] = [];
  let bucketItems: DevListColumn[] = [];
  let bucketTable = '';
  const flush = () => {
    if (bucket.length === 0) return;
    if (bucket.length === 1) {
      // 只有一列时不生成两级表头，退回「表名-字段」防止同名歧义
      result.push(columnOf(bucketItems[0], true));
    } else {
      result.push({ label: subTableOf(bucketTable)?.label ?? bucketTable, children: bucket });
    }
    bucket = [];
    bucketItems = [];
    bucketTable = '';
  };
  for (const item of renderedListColumns.value) {
    if (item.source === 'subtable') {
      if (bucket.length > 0 && bucketTable !== (item.tableName ?? '')) flush();
      bucketTable = item.tableName ?? '';
      bucket.push(columnOf(item, false));
      bucketItems.push(item);
      continue;
    }
    flush();
    result.push(columnOf(item));
  }
  flush();
  return result;
}

const columns = computed<ProTableColumn[]>(() => {
  const head: ProTableColumn[] = [{ type: 'selection', width: 48 }];
  if (isMergeView.value) {
    // 合并展示时序号跟着主记录走，用 __index 而不是行号
    head.push({ label: '序号', width: 70, align: 'center', slot: 'indexCell' });
  } else {
    // 有子表时给出展开列：展开行按嵌套表格展示明细（只读）
    if (subTables.value.length > 0) {
      head.push({ type: 'expand' as const, width: 44, slot: 'subDetail' });
    }
    head.push({ type: 'index', label: '序号', width: 70 });
  }
  return [
    ...head,
    ...bodyColumns(),
    { label: '操作', width: 190, fixed: 'right' as const, slot: 'actions' },
  ];
});

const tableRef = ref<any>(null);
const selection = ref<Record<string, any>[]>([]);
/** 明细版本号：主表写操作后自增，让展开区的嵌套表格重新拉取 */
const detailVersion = ref(0);

/** 合并展示时按主记录去重后的选中条数（全选会选中同一记录的多个明细行） */
const selectedCount = computed(() => new Set(selection.value.map((row) => row.id)).size);

/**
 * 主表列 + 子表列合并展示：一条主记录按明细行数拍平成多行，
 * 子表字段用 sub_<从表>_<列> 作为列标识，主表字段每行都带（只显示在合并后的首行）。
 */
function flattenRows(list: Record<string, any>[]): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  list.forEach((master, index) => {
    const groups = subTables.value.map(
      (sub) => (master.details?.[sub.tableName] ?? []) as SubTableRow[],
    );
    const count = Math.max(1, ...groups.map((group) => group.length));
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      const row: Record<string, any> = {
        ...master,
        __flatKey: `${master.id}-${rowIndex}`,
        __span: count,
        __first: rowIndex === 0,
        __index: index + 1,
      };
      subTables.value.forEach((sub, subIndex) => {
        const detail = groups[subIndex][rowIndex];
        for (const column of sub.columns ?? []) {
          row[subColumnKey(sub.tableName, column.columnName)] = detail
            ? detail[column.name]
            : null;
        }
      });
      rows.push(row);
    }
  });
  return rows;
}

async function loadData(params: Record<string, unknown>) {
  if (!isMergeView.value) return listPreviewRecords(props.formId, params);
  const result = await listPreviewRecords(props.formId, { ...params, withDetails: 1 });
  return { ...result, list: flattenRows(result.list ?? []) };
}

function handleSelectionChange(selected: Record<string, any>[]): void {
  selection.value = selected;
}

/** 子表列每行独立，其余列（勾选/序号/主表列/操作）按主记录跨行合并 */
function spanMethod({ row, column }: { row: any; column: any }): [number, number] | void {
  if (!isMergeView.value) return [1, 1];
  const span = Number(row?.__span ?? 1);
  if (span <= 1) return [1, 1];
  const prop = column?.property as string | undefined;
  if (prop && prop.startsWith('sub_')) return [1, 1];
  return row.__first ? [span, 1] : [0, 0];
}

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit' | 'view'>('create');
const editingId = ref<number | null>(null);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<Record<string, any>>({});

/** 明细数据：键为从表表名，与设计器第 3 步的子表一一对应 */
const details = reactive<Record<string, SubTableRow[]>>({});
const detailsLoading = ref(false);
/** 明细是否加载成功；失败时保存不提交明细，避免误清空已有明细 */
const detailsLoaded = ref(false);

function resetDetails(loaded = true): void {
  for (const key of Object.keys(details)) delete details[key];
  for (const sub of subTables.value) details[sub.tableName] = [];
  // 新增时明细以空数组为准，可以直接提交；编辑/查看要等接口返回
  detailsLoaded.value = loaded;
}

async function loadDetails(rowId: number): Promise<void> {
  if (subTables.value.length === 0) return;
  detailsLoading.value = true;
  try {
    const result = await getPreviewRecordDetails(props.formId, rowId);
    for (const sub of subTables.value) {
      const rows = result.details?.[sub.tableName] ?? [];
      details[sub.tableName] = rows.map((row, index) => ({
        ...row,
        __key: `${sub.tableName}_${row.id ?? index}_${index}`,
      }));
    }
    detailsLoaded.value = true;
  } catch {
    detailsLoaded.value = false;
    ElMessage.warning('明细数据加载失败，本次保存不会改动明细');
  } finally {
    detailsLoading.value = false;
  }
}

const dialogTitle = computed(() => {
  const action = dialogMode.value === 'create' ? '新增' : dialogMode.value === 'edit' ? '编辑' : '查看';
  return `${action} - ${formName.value}`;
});

/** 有明细时弹窗加宽，明细表格才有足够横向空间 */
const dialogType = computed(() => schema.value?.dialogType ?? 'center');
const isDrawer = computed(() => dialogType.value === 'right');
const isFullscreen = computed(() => dialogType.value === 'fullscreen');
/** 表单宽度：显式配置优先（支持 px / %），否则默认宽度；与表单尺寸无关 */
const dialogWidth = computed(() => formWidthOf(schema.value?.dialogWidth));

/** 控件尺寸由表单尺寸档位决定（旧 schema 按 size 反推） */
const formElSize = computed(() => elSizeOf(normalizeFormSize(schema.value ?? {})));

const rules = computed<FormRules>(() => {
  const result: FormRules = {};
  for (const field of schemaFields.value) {
    if (!field.required) continue;
    const isChoice = [
      'select',
      'radio',
      'checkbox',
      'date',
      'datetime',
      'slider',
      'color',
      'file',
      'image',
      'qrcode',
      'barcode',
      'relationForm',
      'dialogSelect',
      'userSelect',
      'roleSelect',
    ].includes(field.type);
    const rule: Record<string, unknown> = {
      required: true,
      message: `请${isChoice ? '选择' : '输入'}${field.label}`,
      trigger: isChoice ? 'change' : 'blur',
    };
    if (field.type === 'checkbox') rule.type = 'array';
    result[field.name] = rule as any;
  }
  return result;
});

function defaultValue(field: DevFormField): any {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'switch') return false;
  if (field.type === 'checkbox') return [];
  if (field.type === 'slider') return field.min ?? 0;
  if (field.type === 'number' || field.type === 'date' || field.type === 'datetime') return null;
  return '';
}

function resetForm(): void {
  for (const key of Object.keys(form)) delete form[key];
  for (const field of schemaFields.value) form[field.name] = defaultValue(field);
  void nextTick(() => formRef.value?.clearValidate());
}

function fillForm(row: Record<string, any>): void {
  resetForm();
  for (const field of schemaFields.value) form[field.name] = row[field.name] ?? defaultValue(field);
}

function openCreate(): void {
  dialogMode.value = 'create';
  editingId.value = null;
  resetForm();
  resetDetails();
  dialogVisible.value = true;
}

function openEdit(row: Record<string, any>): void {
  dialogMode.value = 'edit';
  editingId.value = row.id;
  fillForm(row);
  resetDetails(false);
  dialogVisible.value = true;
  void loadDetails(row.id);
}

function openView(row: Record<string, any>): void {
  dialogMode.value = 'view';
  editingId.value = row.id;
  fillForm(row);
  resetDetails(false);
  dialogVisible.value = true;
  void loadDetails(row.id);
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  // 明细必填先在前端拦一次，避免整单提交后才报错
  for (const sub of subTables.value) {
    const error = subTableValidateRows(sub, details[sub.tableName] ?? []);
    if (error) {
      ElMessage.warning(error);
      return;
    }
  }

  const payload: Record<string, unknown> = { ...form };
  if (subTables.value.length > 0 && detailsLoaded.value) {
    payload.details = Object.fromEntries(
      subTables.value.map((sub) => [sub.tableName, subTablePayload(details[sub.tableName] ?? [])]),
    );
  }

  saving.value = true;
  try {
    if (dialogMode.value === 'create') {
      await createPreviewRecord(props.formId, payload);
      ElMessage.success('新增成功');
    } else if (editingId.value !== null) {
      await updatePreviewRecord(props.formId, editingId.value, payload);
      ElMessage.success('编辑成功');
    }
    dialogVisible.value = false;
    detailVersion.value += 1;
    clearSubTableDetailCache();
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(message: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
    return true;
  } catch {
    return false;
  }
}

async function handleDelete(row: Record<string, any>): Promise<void> {
  if (!(await confirmDelete('确定删除该条真实数据吗？若目标表支持软删除，将写入 deleted_at。'))) return;
  try {
    await deletePreviewRecord(props.formId, row.id);
    ElMessage.success('删除成功');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

async function handleBatchDelete(): Promise<void> {
  if (selection.value.length === 0) {
    ElMessage.warning('请先选择要删除的数据');
    return;
  }
  // 合并展示时同一主记录会占多行，按主记录去重再删
  const ids = [...new Set(selection.value.map((row) => row.id))];
  if (!(await confirmDelete(`确定删除选中的 ${ids.length} 条真实数据吗？`))) return;
  try {
    for (const id of ids) {
      await deletePreviewRecord(props.formId, id);
    }
    selection.value = [];
    tableRef.value?.clearSelection();
    ElMessage.success('批量删除成功');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const detail = await getDevForm(props.formId);
    formName.value = detail.name;
    formKey.value = detail.formKey;
    schema.value = detail.schema;
    void nextTick(() => tableRef.value?.reload());
  } catch (error) {
    schema.value = null;
    loadError.value =
      (error as { message?: string })?.message || '表单加载失败，可能已被删除或下线';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.formId, load);
</script>

<template>
  <div v-loading="loading" class="form-preview-table">
    <ProTable
      v-if="schemaFields.length > 0"
      ref="tableRef"
      :columns="columns"
      :search-items="searchItems"
      :request="loadData"
      :page-sizes="[10, 20, 50]"
      :row-key="isMergeView ? '__flatKey' : 'id'"
      :span-method="isMergeView ? spanMethod : undefined"
      @selection-change="handleSelectionChange"
    >
      <template #toolbar>
        <el-button v-if="canCreate" type="primary" @click="openCreate">新增</el-button>
        <el-button
          v-if="canDelete"
          type="danger"
          plain
          :disabled="selection.length === 0"
          @click="handleBatchDelete"
        >
          批量删除<span v-if="selection.length > 0">（{{ selectedCount }}）</span>
        </el-button>
        <el-button @click="tableRef?.reload()">刷新</el-button>
      </template>

      <template #indexCell="{ row }">{{ row.__index }}</template>

      <!-- 图片/文件列：图片出缩略图可点开大图，文件出可下载链接 -->
      <template v-for="slot in uploadSlots" :key="slot.name" #[slot.name]="scope">
        <UploadCell
          :type="slot.type"
          :value="scope.row[slot.prop]"
          :aggregated="slot.aggregated"
        />
      </template>

      <template #subDetail="{ row }">
        <!-- key 带明细版本号：主表保存后展开区重新拉取，不会残留旧明细 -->
        <SubTableNested
          v-if="row && row.id"
          :key="`${row.id}-${detailVersion}`"
          :form-id="formId"
          :row-id="row.id"
          :subtables="subTables"
          :version="detailVersion"
        />
      </template>

      <template #actions="{ row }">
        <el-button link type="primary" @click="openView(row)">查看</el-button>
        <el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button>
        <el-button v-if="canDelete" link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <el-empty v-else-if="loadError" :description="loadError" />
    <el-empty v-else-if="!loading" description="该表单还没有字段，请先在设计器第 2 步添加字段" />

    <AppDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :variant="isDrawer ? 'drawer' : 'dialog'"
      direction="rtl"
      :width="dialogWidth"
      :fullscreen="isFullscreen"
      :show-confirm="dialogMode !== 'view'"
      :cancel-text="dialogMode === 'view' ? '关闭' : '取消'"
      :confirm-loading="saving"
      @confirm="handleSave"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        :label-width="`${schema?.labelWidth ?? 100}px`"
        :label-position="schema?.labelPosition ?? 'right'"
        :size="formElSize"
        :disabled="dialogMode === 'view' || schema?.disabled"
        :label-suffix="schema?.labelSuffix"
        :hide-required-asterisk="schema?.hideRequiredAsterisk"
        :show-message="schema?.showMessage"
        :status-icon="schema?.statusIcon"
      >
        <el-row v-loading="detailsLoading" :gutter="16">
          <!-- 控件与子表区块按设计器的混排顺序渲染 -->
          <template v-for="item in dialogItems" :key="item.id">
            <el-col v-if="item.kind === 'field' && item.field" :span="item.field.span || 24">
              <el-form-item
                :label="item.field.label"
                :prop="item.field.name"
                :label-width="labelWidthOf(item.field)"
              >
                <div class="form-preview-table__control" :style="controlBoxStyle(item.field)">
                  <FieldControl
                    :field="item.field"
                    v-model="form[item.field.name]"
                    :disabled="dialogMode === 'view'"
                    :values="form"
                    :code-labels="codeFieldLabels"
                  />
                </div>
              </el-form-item>
            </el-col>
            <el-col v-else-if="item.kind === 'subtable' && item.sub" :span="item.sub.span || 24">
              <SubTableEditor
                :subtable="item.sub"
                :model-value="details[item.sub.tableName] ?? []"
                :readonly="dialogMode === 'view' || Boolean(schema?.disabled)"
                @update:model-value="(rows) => (details[item.sub!.tableName] = rows)"
              />
            </el-col>
          </template>
        </el-row>
      </el-form>

      <template v-if="!isFullscreen" #footer>
        <el-button @click="dialogVisible = false">{{ dialogMode === 'view' ? '关闭' : '取消' }}</el-button>
        <el-button v-if="dialogMode !== 'view'" type="primary" :loading="saving" @click="handleSave">
          保存
        </el-button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped lang="scss">
.form-preview-table {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.form-preview-table__control {
  max-width: 100%;
}
</style>
