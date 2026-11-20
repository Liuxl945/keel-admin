<script setup lang="ts">
defineOptions({ name: 'SubTableNested' });

import { computed, onMounted, ref } from 'vue';
import { getPreviewRecordDetails } from '@/api/dev-form-preview';
import type { DevFormSubTable, DevSubTableColumn } from '@/types/dev';
import { formatByPattern } from '@/utils/datetime';
import { formatDataPickerCell, formatUploadCell, dateFormatOf } from '@/components/form-controls';
import UploadCell from '@/components/form-controls/UploadCell.vue';
import type { SubTableRow } from './subtable-helper';
import { detailColumnsOf } from './subtable-helper';
import { loadDetailsCached } from './subtable-detail-cache';

const props = defineProps<{
  formId: number;
  rowId: number;
  subtables: DevFormSubTable[];
  /** 明细版本号，由父组件在主表保存后自增 */
  version?: number;
}>();

const loading = ref(false);
const failed = ref('');
const details = ref<Record<string, SubTableRow[]>>({});

/**
 * 展开区的展示列：顺序跟设计器里明细列的拖拽顺序，listFields 只决定显示哪些；
 * 都没配时取可见字段，最多 6 列，避免展开区里横向无限拉长。
 */
function displayColumns(sub: DevFormSubTable): DevSubTableColumn[] {
  const all = sub.columns ?? [];
  const configured = sub.listFields ?? [];
  if (configured.length > 0) {
    const picked = detailColumnsOf(sub);
    if (picked.length > 0) return picked;
  }
  const visible = all.filter((column) => column.visible !== false);
  return (visible.length > 0 ? visible : all).slice(0, 6);
}

function formatValue(value: unknown, column: DevSubTableColumn, row?: Record<string, any>): string {
  if (value === null || value === undefined || value === '') return '-';
  const label = row ? row[`${column.name}Label`] : undefined;
  if (typeof label === 'string' && label) return label;
  const pickerText = formatDataPickerCell(value, column.type);
  if (pickerText !== null) return pickerText;
  if (column.type === 'switch') return value ? '是' : '否';
  if (column.type === 'date' || column.type === 'datetime') {
    return formatByPattern(value as string, dateFormatOf(column));
  }
  if (column.type === 'image' || column.type === 'file') return formatUploadCell(value);
  if (Array.isArray(value)) return value.length > 0 ? value.join('、') : '-';
  return String(value);
}

/** 图片/文件列交给 UploadCell 渲染，其余走文本格式化 */
function isUploadColumn(column: DevSubTableColumn): boolean {
  return column.type === 'image' || column.type === 'file';
}

const groups = computed(() =>
  props.subtables.map((sub) => ({
    sub,
    columns: displayColumns(sub),
    rows: details.value[sub.tableName] ?? [],
  })),
);

async function load(): Promise<void> {
  if (props.subtables.length === 0) return;
  const key = `${props.formId}:${props.rowId}:${props.version ?? 0}`;
  loading.value = true;
  failed.value = '';
  try {
    const data = await loadDetailsCached(key, () =>
      getPreviewRecordDetails(props.formId, props.rowId).then((result) => result.details ?? {}),
    );
    details.value = data;
  } catch (error) {
    failed.value = (error as { message?: string })?.message || '明细加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

defineExpose({ reload: load });
</script>

<template>
  <div v-loading="loading" class="subtable-nested">
    <el-alert
      v-if="failed"
      class="subtable-nested__error"
      type="warning"
      :title="failed"
      :closable="false"
      show-icon
    />

    <div v-for="group in groups" :key="group.sub.tableName" class="subtable-nested__group">
      <div class="subtable-nested__head">
        <span class="subtable-nested__title">{{ group.sub.label }}</span>
        <el-tag size="small" type="info" effect="plain">{{ group.sub.tableName }}</el-tag>
        <span class="subtable-nested__count">共 {{ group.rows.length }} 条</span>
      </div>
      <el-table
        :data="group.rows"
        size="small"
        border
        :empty-text="`暂无${group.sub.label}明细`"
      >
        <el-table-column type="index" label="#" width="48" align="center" />
        <el-table-column
          v-for="column in group.columns"
          :key="column.id"
          :label="column.label"
          min-width="130"
          :show-overflow-tooltip="!isUploadColumn(column)"
        >
          <template #default="{ row }">
            <UploadCell
              v-if="isUploadColumn(column)"
              :type="column.type as 'image' | 'file'"
              :value="row[column.name]"
            />
            <template v-else>{{ formatValue(row[column.name], column, row) }}</template>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.subtable-nested {
  padding: 12px 16px 14px 40px;
  background: var(--el-fill-color-lighter);
  overflow-x: auto;

  &__error {
    margin-bottom: 10px;
  }

  &__group + &__group {
    margin-top: 14px;
  }

  &__head {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__count {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>
