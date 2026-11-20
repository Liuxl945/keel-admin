<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { TableInstance } from 'element-plus';
import { useFillHeight } from '@/composables/useFillHeight';
import type { ProTableColumn, ProTableResult, SearchItem } from './types';

const props = withDefaults(
  defineProps<{
    columns: ProTableColumn[];
    searchItems?: SearchItem[];
    request: (params: Record<string, unknown>) => Promise<ProTableResult>;
    rowKey?: string;
    initialSearch?: Record<string, any>;
    pageSizes?: number[];
    immediate?: boolean;
    /** 单元格合并：透传 el-table 的 span-method（主表列跨行合并等场景） */
    spanMethod?: (data: {
      row: any;
      column: any;
      rowIndex: number;
      columnIndex: number;
    }) => [number, number] | void;
  }>(),
  {
    searchItems: () => [],
    rowKey: 'id',
    initialSearch: () => ({}),
    pageSizes: () => [20, 50, 100, 200],
    immediate: true,
  },
);

const emit = defineEmits<{ 'selection-change': [rows: any[]] }>();

const tableRef = ref<TableInstance>();
const { containerRef: tableContainerRef, height: tableHeight } = useFillHeight(120);
const list = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const sortBy = ref('');
const sortOrder = ref<'ASC' | 'DESC' | ''>('');
const selection = ref<any[]>([]);

const searchForm = reactive<Record<string, any>>({ ...props.initialSearch });

function cloneDefault(value: SearchItem['defaultValue']): any {
  if (Array.isArray(value)) return [...value];
  return value ?? '';
}

/** 搜索项只渲染非隐藏项，隐藏项仍参与参数提交 */
const visibleSearchItems = computed(() => props.searchItems.filter((item) => !item.hidden));

function itemDefault(item: SearchItem): any {
  if (item.defaultValue !== undefined && item.defaultValue !== null) return cloneDefault(item.defaultValue);
  return '';
}

/** 查询项是异步加载的（随表单设计返回），到齐后把默认值写进查询表单 */
watch(
  () => props.searchItems,
  (items) => {
    for (const item of items) {
      const current = searchForm[item.prop];
      const empty = current === undefined || current === null || current === '';
      if (empty && item.defaultValue !== undefined && item.defaultValue !== null) {
        searchForm[item.prop] = cloneDefault(item.defaultValue);
      }
    }
  },
  { immediate: true },
);

function buildSearchParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const item of props.searchItems) {
    const value = searchForm[item.prop];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (item.type === 'daterange' && Array.isArray(value)) {
      if (!value[0] || !value[1]) continue;
      params[item.startProp ?? 'startTime'] = value[0];
      params[item.endProp ?? 'endTime'] = value[1];
      continue;
    }
    params[item.prop] = value;
  }
  return params;
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const params: Record<string, unknown> = {
      ...buildSearchParams(),
      page: page.value,
      pageSize: pageSize.value,
    };
    if (sortBy.value && sortOrder.value) {
      params.sortBy = sortBy.value;
      params.sortOrder = sortOrder.value;
    }

    const result = await props.request(params);
    list.value = result.list ?? [];
    total.value = result.total ?? 0;
    if (result.page) page.value = result.page;
    if (result.pageSize) pageSize.value = result.pageSize;
  } catch {
    // 错误提示由 request 拦截器统一处理，这里只保证表格不残留旧数据
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function handleSearch(): void {
  page.value = 1;
  void fetchData();
}

function handleReset(): void {
  for (const key of Object.keys(searchForm)) {
    searchForm[key] = props.initialSearch[key] ?? '';
  }
  for (const item of props.searchItems) {
    searchForm[item.prop] = itemDefault(item);
  }
  page.value = 1;
  void fetchData();
}

function handlePageChange(value: number): void {
  page.value = value;
  void fetchData();
}

function handleSizeChange(value: number): void {
  pageSize.value = value;
  page.value = 1;
  void fetchData();
}

function handleSortChange(payload: { prop: string; order: 'ascending' | 'descending' | null }): void {
  if (!payload.order) {
    sortBy.value = '';
    sortOrder.value = '';
  } else {
    const column = props.columns.find((item) => item.prop === payload.prop);
    sortBy.value = column?.sortParam ?? payload.prop;
    sortOrder.value = payload.order === 'ascending' ? 'ASC' : 'DESC';
  }
  page.value = 1;
  void fetchData();
}

function handleSelectionChange(rows: any[]): void {
  selection.value = rows;
  emit('selection-change', rows);
}

function bindColumn(column: ProTableColumn): Record<string, unknown> {
  const result: Record<string, unknown> = {
    label: column.label ?? '',
    ...(column.width !== undefined ? { width: column.width } : {}),
    ...(column.minWidth !== undefined ? { minWidth: column.minWidth } : {}),
    ...(column.fixed !== undefined ? { fixed: column.fixed } : {}),
    ...(column.align !== undefined ? { align: column.align } : {}),
    ...(column.headerAlign !== undefined ? { headerAlign: column.headerAlign } : {}),
    ...(column.prop !== undefined ? { prop: column.prop } : {}),
    ...(column.showOverflowTooltip !== undefined
      ? { showOverflowTooltip: column.showOverflowTooltip }
      : {}),
    ...(column.formatter !== undefined ? { formatter: column.formatter } : {}),
    ...(column.type !== undefined ? { type: column.type } : {}),
    sortable: column.sortable === 'custom' ? 'custom' : (column.sortable ?? false),
  };
  return result;
}

/** 分组表头（多级表头的一级）：只带标签/对齐，数据列都挂在 children 上 */
function bindGroupColumn(column: ProTableColumn): Record<string, unknown> {
  return {
    label: column.label ?? '',
    ...(column.align !== undefined ? { align: column.align } : {}),
    // 一级分组表头默认居中，可用 headerAlign 覆盖
    headerAlign: column.headerAlign ?? 'center',
    ...(column.fixed !== undefined ? { fixed: column.fixed } : {}),
  };
}

onMounted(() => {
  if (props.immediate) void fetchData();
});

defineExpose({
  reload: fetchData,
  reset: handleReset,
  /** 导出等场景复用当前查询条件（不含分页） */
  getSearchParams: buildSearchParams,
  getSelection: () => selection.value,
  clearSelection: () => tableRef.value?.clearSelection(),
});
</script>

<template>
  <div class="pro-table">
    <el-form
      v-if="visibleSearchItems.length > 0"
      class="pro-table__search"
      :inline="true"
      @submit.prevent
    >
      <el-form-item v-for="item in visibleSearchItems" :key="item.prop" :label="item.label">
        <el-select
          v-if="item.type === 'select'"
          v-model="searchForm[item.prop]"
          :clearable="item.clearable !== false"
          :multiple="item.multiple"
          :collapse-tags="item.multiple"
          collapse-tags-tooltip
          :placeholder="item.placeholder || '全部'"
          :style="{ width: typeof item.width === 'number' ? `${item.width}px` : item.width || '160px' }"
          @change="item.autoSearch ? handleSearch() : undefined"
        >
          <el-option
            v-for="option in item.options || []"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-date-picker
          v-else-if="item.type === 'daterange'"
          v-model="searchForm[item.prop]"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :style="{ width: typeof item.width === 'number' ? `${item.width}px` : item.width || '260px' }"
        />
        <el-date-picker
          v-else-if="item.type === 'date'"
          v-model="searchForm[item.prop]"
          type="date"
          value-format="YYYY-MM-DD"
          :placeholder="item.placeholder || '请选择日期'"
          :style="{ width: typeof item.width === 'number' ? `${item.width}px` : item.width || '160px' }"
        />
        <el-input
          v-else
          v-model="searchForm[item.prop]"
          :clearable="item.clearable !== false"
          :placeholder="item.placeholder || '请输入'"
          :style="{ width: typeof item.width === 'number' ? `${item.width}px` : item.width || '180px' }"
          @keyup.enter="handleSearch"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleSearch">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <div v-if="$slots.toolbar" class="pro-table__toolbar">
      <slot name="toolbar" :selection="selection" />
    </div>

    <div ref="tableContainerRef" class="pro-table__table">
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="list"
        :row-key="rowKey"
        :height="tableHeight"
        :span-method="spanMethod"
        border
        @selection-change="handleSelectionChange"
        @sort-change="handleSortChange"
      >
        <template v-for="(column, index) in columns" :key="column.prop || column.type || index">
          <!-- 分组表头：一级只做分组名，数据交给二级叶子列 -->
          <el-table-column
            v-if="column.children?.length"
            v-bind="bindGroupColumn(column)"
          >
            <el-table-column
              v-for="(child, childIndex) in column.children"
              :key="child.prop || child.type || childIndex"
              v-bind="bindColumn(child)"
            >
              <template v-if="child.slot" #default="scope">
                <slot :name="child.slot" v-bind="scope" />
              </template>
            </el-table-column>
          </el-table-column>
          <el-table-column v-else-if="column.slot" v-bind="bindColumn(column)">
            <template #default="scope">
              <slot :name="column.slot" v-bind="scope" />
            </template>
          </el-table-column>
          <el-table-column v-else v-bind="bindColumn(column)" />
        </template>
      </el-table>
    </div>

    <div class="pro-table__footer">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="pageSizes"
        :total="total"
        background
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.pro-table {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
}

.pro-table__table {
  flex: 1;
  min-height: 120px;
}

.pro-table__search {
  padding-bottom: 4px;
  border-bottom: 1px solid #f0f2f5;
}

.pro-table__search :deep(.el-form-item) {
  margin-bottom: 12px;
}

.pro-table__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pro-table__footer {
  display: flex;
  flex: none;
  justify-content: flex-end;
}
</style>
