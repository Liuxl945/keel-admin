import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type {
  CommonField,
  DataFetchHandler,
  DataListResult,
  DataPickerColumn,
} from './types';

/** 选中项：v 是写入数据库的值，l 是回显文本（一起存进一个 JSON 字段，保证重新打开可还原） */
export interface PickerItem {
  v: string;
  l: string;
}

interface DataPickerProps {
  field: CommonField;
  modelValue: string | null | undefined;
  disabled?: boolean;
  fetch?: DataFetchHandler;
}

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [10, 20, 50, 100];

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** 只解析 {v,l} 结构，不处理 l 本身又是 JSON 的情况（内部使用） */
function parsePickerItems(raw: string | null | undefined): PickerItem[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
        .map((item) => ({
          v: asText(item.v ?? item.value ?? ''),
          l: asText(item.l ?? item.label ?? item.v ?? item.value ?? ''),
        }))
        .filter((item) => item.v !== '' || item.l !== '');
    } catch {
      // 非法 JSON 按普通值兜底
    }
  }
  return [{ v: text, l: text }];
}

/**
 * 显示文本本身可能又是一个 {v,l} JSON：关联表单的数据源列若也是选择器控件，
 * 回填时就会拿到 `[{"v":"4","l":"测试菜单"}]`，这里再拆一层取出纯文本。
 */
function unwrapPickerLabel(raw: string): string {
  const text = raw.trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    const nested = parsePickerItems(text);
    if (nested.length > 0) return nested.map((item) => item.l || item.v).join('、');
  }
  return raw;
}

/**
 * 值编解码：单选存 {v,l}，多选存 [{v,l}]，空值存空串。
 * 兼容旧数据 / 手填的普通字符串（按「值即文本」处理）以及 value/label 写法。
 */
export function decodePickerItems(raw: string | null | undefined): PickerItem[] {
  return parsePickerItems(raw).map((item) => ({ ...item, l: unwrapPickerLabel(item.l) }));
}

export function encodePickerItems(items: PickerItem[], multiple: boolean): string {
  if (items.length === 0) return '';
  return JSON.stringify(multiple ? items : items[0]);
}

/**
 * 关联表单 / 弹框选择共用逻辑：弹框状态、分页、关键字、单选/多选、回填。
 * 数据完全由注入的 fetch 回调提供，控件本身不感知数据来源是表单还是接口。
 */
export function useDataPicker(
  props: DataPickerProps,
  emit: (event: 'update:modelValue', value: string) => void,
) {
  const isDisabled = computed(() => Boolean(props.disabled || props.field.disabled));
  const isMultiple = computed(() => Boolean(props.field.multiple));
  const columns = computed<DataPickerColumn[]>(() =>
    (props.field.listFields ?? []).filter((item) => item && item.key),
  );
  const valueKey = computed(() => props.field.valueField ?? '');
  const displayKey = computed(() => props.field.displayField ?? '');
  /** 用户 / 角色选择：数据源内置，不依赖 sourceId */
  const isBuiltin = computed(() => Boolean(props.field.builtinSource));
  /** 内置源默认按关键词搜索，配置项留空也能用 */
  const keywordKey = computed(() => props.field.keywordKey ?? '');

  const items = computed<PickerItem[]>(() => decodePickerItems(props.modelValue));
  const displayText = computed(() => items.value.map((item) => item.l || item.v).join('、'));
  const placeholder = computed(() => props.field.placeholder || `请选择${props.field.label ?? ''}`);

  const dialogVisible = ref(false);
  const loading = ref(false);
  const rows = ref<Record<string, unknown>[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(DEFAULT_PAGE_SIZE);
  const keyword = ref('');
  /** 弹框内已选：跨分页保留，key = 存储字段值 */
  const checked = ref<Map<string, PickerItem>>(new Map());
  const checkedCount = computed(() => checked.value.size);
  const tableRef = ref<any>(null);
  /** 单选时的当前选中行 key */
  const activeRowKey = ref('');

  function rowKey(row: Record<string, unknown>): string {
    return valueKey.value ? asText(row[valueKey.value]) : '';
  }

  function itemOf(row: Record<string, unknown>): PickerItem {
    const key = rowKey(row);
    // 数据源没配显示列、或显示列值为空时，沿用已存的回显文本，避免再次选择时把中文标签覆盖成主键
    const savedLabel = checked.value.get(key)?.l || '';
    if (!displayKey.value) return { v: key, l: savedLabel || key };
    // 数据源的显示列本身可能也是选择器控件（存着 {v,l}），优先用后端回显文本，再解一层兜底
    const labelFromApi = row[`${displayKey.value}Label`];
    const rawLabel =
      typeof labelFromApi === 'string' && labelFromApi !== ''
        ? labelFromApi
        : asText(row[displayKey.value]);
    return { v: key, l: unwrapPickerLabel(rawLabel) || savedLabel || key };
  }

  function configured(): boolean {
    if (!isBuiltin.value && !props.field.sourceId) {
      ElMessage.warning('请先在右侧「数据源配置」里选择数据来源');
      return false;
    }
    if (!valueKey.value) {
      ElMessage.warning('请先配置「存储字段」');
      return false;
    }
    if (columns.value.length === 0) {
      ElMessage.warning('请先配置「列表字段」');
      return false;
    }
    if (!props.fetch) {
      ElMessage.warning('当前环境未提供数据获取方式');
      return false;
    }
    return true;
  }

  async function loadRows(): Promise<void> {
    if (!props.fetch) return;
    if (!isBuiltin.value && !props.field.sourceId) return;
    loading.value = true;
    try {
      const result: DataListResult = await props.fetch({
        // 内置源没有数据源 id，传 0 占位
        sourceId: Number(props.field.sourceId ?? 0),
        page: page.value,
        pageSize: pageSize.value,
        keyword: keyword.value.trim() || undefined,
        keywordKey: keywordKey.value || null,
      });
      rows.value = (result.rows ?? []).filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      );
      total.value = Number(result.total ?? rows.value.length);
      // 勾选态统一由下方 watch 在表格渲染完成后回填，避免表格尚未挂载时同步丢失
    } catch {
      rows.value = [];
      total.value = 0;
      // 错误提示由 request 拦截器统一处理
    } finally {
      loading.value = false;
    }
  }

  function syncTableSelection(): void {
    const table = tableRef.value;
    if (!table || !isMultiple.value) return;
    // 先清空再按已选值回填，避免上一次打开残留的勾选项混入；
    // 公开方法 toggleRowSelection 不发 select 事件，不会反写 checked
    table.clearSelection();
    for (const row of rows.value) {
      if (checked.value.has(rowKey(row))) table.toggleRowSelection(row, true);
    }
  }

  // 弹框是懒渲染的：表格实例挂载、数据切换都要重新回填选中态，
  // 否则「再次打开 / 翻页 / 搜索」时已选项看起来是空的。
  watch(
    () => [dialogVisible.value, tableRef.value, rows.value] as const,
    () => {
      if (!dialogVisible.value || !isMultiple.value) return;
      void nextTick(syncTableSelection);
    },
    { flush: 'post' },
  );

  async function openDialog(): Promise<void> {
    if (isDisabled.value || !configured()) return;
    const next = new Map<string, PickerItem>();
    for (const item of items.value) if (item.v) next.set(item.v, item);
    checked.value = next;
    activeRowKey.value = [...next.keys()][0] ?? '';
    keyword.value = '';
    page.value = 1;
    dialogVisible.value = true;
    // 等弹框内容渲染出表格实例再拉取数据，保证回填同步能命中表格
    await nextTick();
    await loadRows();
  }

  function handleSearch(): void {
    page.value = 1;
    void loadRows();
  }

  function handlePageChange(next: number): void {
    page.value = next;
    void loadRows();
  }

  function handleSizeChange(next: number): void {
    pageSize.value = next;
    page.value = 1;
    void loadRows();
  }

  /**
   * 以本次选择为准重算当前页：其它页的已选项保留，当前页取消的移除。
   * 只挂 @select / @select-all（仅用户真实点击时触发）——
   * 不能用 @selection-change：loadRows 刷新数据时 el-table 会带空选中数组触发它，
   * 把已选项误删，导致「再次打开弹框回填为空」。
   */
  function applySelection(selected: Record<string, unknown>[]): void {
    const pageKeys = new Set(rows.value.map(rowKey));
    const next = new Map(checked.value);
    for (const key of pageKeys) next.delete(key);
    for (const row of selected) {
      const key = rowKey(row);
      if (key) next.set(key, itemOf(row));
    }
    checked.value = next;
  }

  function handleSelect(selected: Record<string, unknown>[]): void {
    applySelection(selected);
  }

  function handleSelectAll(selected: Record<string, unknown>[]): void {
    applySelection(selected);
  }

  function handleRadioChange(row: Record<string, unknown>): void {
    const key = rowKey(row);
    if (!key) {
      ElMessage.warning('该行「存储字段」为空，无法选择');
      return;
    }
    activeRowKey.value = key;
    checked.value = new Map([[key, itemOf(row)]]);
  }

  function handleRowClick(row: Record<string, unknown>): void {
    if (isMultiple.value) {
      // 行点击自己维护选中集合（公开 toggleRowSelection 不发事件，靠它同步勾选框）
      const key = rowKey(row);
      if (!key) return;
      const next = new Map(checked.value);
      if (next.has(key)) next.delete(key);
      else next.set(key, itemOf(row));
      checked.value = next;
      tableRef.value?.toggleRowSelection(row, next.has(key));
    } else {
      handleRadioChange(row);
    }
  }

  function confirm(): void {
    emit('update:modelValue', encodePickerItems([...checked.value.values()], isMultiple.value));
    dialogVisible.value = false;
  }

  function clear(): void {
    emit('update:modelValue', '');
  }

  /** 多选回填时从标签上单独移除某一项 */
  function removeItem(v: string): void {
    const next = items.value.filter((item) => item.v !== v);
    emit('update:modelValue', encodePickerItems(next, isMultiple.value));
  }

  return {
    isDisabled,
    isMultiple,
    columns,
    items,
    displayText,
    checkedCount,
    placeholder,
    dialogVisible,
    loading,
    rows,
    total,
    page,
    pageSize,
    pageSizes: PAGE_SIZES,
    keyword,
    tableRef,
    activeRowKey,
    rowKey,
    openDialog,
    handleSearch,
    handlePageChange,
    handleSizeChange,
    handleSelect,
    handleSelectAll,
    handleRadioChange,
    handleRowClick,
    confirm,
    clear,
    removeItem,
  };
}
