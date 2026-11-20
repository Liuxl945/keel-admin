<script setup lang="ts">
defineOptions({ name: 'SubTableEditor' });

import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import AppDialog from '@/components/AppDialog/index.vue';
import { formatDataPickerCell, formatUploadCell, dateFormatOf } from '@/components/form-controls';
import UploadCell from '@/components/form-controls/UploadCell.vue';
import { formatByPattern } from '@/utils/datetime';
import type { DevFormField, DevFormSubTable, DevSubTableColumn } from '@/types/dev';
import FieldControl from './FieldControl.vue';
import { controlBoxStyle } from './field-style';
import { subTableRowError, detailColumnsOf, type SubTableRow } from './subtable-helper';

const props = defineProps<{
  subtable: DevFormSubTable;
  modelValue: SubTableRow[];
  readonly?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: SubTableRow[]] }>();

const rows = computed<SubTableRow[]>(() => props.modelValue ?? []);
const readonly = computed(() => Boolean(props.readonly));

/** 明细列表展示列：按设计器里拖拽出来的明细列顺序，listFields 只决定显示哪些 */
const listColumns = computed<DevSubTableColumn[]>(() => detailColumnsOf(props.subtable));

/** 明细录入表单：visible 为 false 的字段只作列表列/查询条件 */
const formColumns = computed(() =>
  (props.subtable.columns ?? []).filter((column) => column.visible !== false),
);

/** 同一明细行内的字段标题映射：二维码/条码联动展示用 */
const codeFieldLabels = computed<Record<string, string>>(() => {
  const labels: Record<string, string> = {};
  for (const column of props.subtable.columns ?? []) {
    if (column.name) labels[column.name] = column.label || column.name;
  }
  return labels;
});

let seed = 0;
function nextKey(): string {
  seed += 1;
  return `r${Date.now().toString(36)}_${seed}`;
}

/** 明细列就是一套字段配置，直接透传给 FieldControl（兼容旧数据缺省值） */
function toField(column: DevSubTableColumn): DevFormField {
  return {
    ...column,
    placeholder: column.placeholder ?? '',
    required: Boolean(column.required),
    disabled: Boolean(column.disabled),
    clearable: column.clearable !== false,
    span: column.span || 12,
    options: column.options ?? [],
  };
}

/** 图片/文件列在只读态交给 UploadCell，图片出缩略图、文件出下载链接 */
function isUploadColumn(column: DevSubTableColumn): boolean {
  return column.type === 'image' || column.type === 'file';
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

function createRow(): SubTableRow {
  const row: SubTableRow = { __key: nextKey() };
  for (const column of props.subtable.columns ?? []) {
    row[column.name] = defaultValueOf(column);
  }
  return row;
}

function defaultValueOf(column: DevSubTableColumn): any {
  if (column.type === 'switch') return false;
  if (column.type === 'checkbox') return [];
  if (column.type === 'slider') return column.min ?? 0;
  if (column.type === 'number' || column.type === 'date' || column.type === 'datetime') return null;
  return '';
}

/* ---------------- 表格行内编辑 ---------------- */

const editingKey = ref<string | null>(null);
const editingBackup = ref<SubTableRow | null>(null);
const editingIsNew = ref(false);

function ensureKey(row: SubTableRow): string {
  if (!row.__key) row.__key = nextKey();
  return row.__key;
}

function isEditing(row: SubTableRow): boolean {
  return editingKey.value !== null && row.__key === editingKey.value;
}

function startInline(row: SubTableRow): void {
  editingKey.value = ensureKey(row);
  editingBackup.value = { ...row };
  editingIsNew.value = Boolean(row.__isNew);
}

function resetEditing(): void {
  editingKey.value = null;
  editingBackup.value = null;
  editingIsNew.value = false;
}

/** 当前真正处于编辑态的行；编辑目标已被移除时返回 undefined */
function editingRow(): SubTableRow | undefined {
  if (editingKey.value === null) return undefined;
  return rows.value.find((row) => row.__key === editingKey.value);
}

/**
 * 明细数据由父组件整体替换（弹窗关闭后重新打开、编辑时回填明细）时，
 * 本地编辑态会指向一条已经不存在的行，导致下次「添加明细」被误拦。
 * 这里发现编辑目标消失就顺手复位，避免把上一个弹窗的编辑态带进来。
 */
watch(
  () => rows.value.map((row) => row.__key ?? ''),
  (keys) => {
    if (editingKey.value !== null && !keys.includes(editingKey.value)) resetEditing();
  },
);

function commitInline(row: SubTableRow): void {
  const error = subTableRowError(props.subtable, row);
  if (error) {
    ElMessage.warning(error);
    return;
  }
  delete row.__isNew;
  resetEditing();
}

function cancelInline(row: SubTableRow): void {
  if (editingIsNew.value) {
    emit(
      'update:modelValue',
      rows.value.filter((item) => item.__key !== row.__key),
    );
  } else if (editingBackup.value) {
    Object.assign(row, editingBackup.value);
  }
  resetEditing();
}

/* ---------------- 弹窗编辑 ---------------- */

const dialogVisible = ref(false);
const dialogForm = reactive<Record<string, any>>({});
const dialogFormRef = ref<FormInstance>();
/** 正在编辑的明细行 key；为空表示新增 */
const dialogTargetKey = ref<string | null>(null);

const dialogRules = computed<FormRules>(() => {
  const result: FormRules = {};
  for (const column of formColumns.value) {
    if (!column.required) continue;
    const choice = [
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
    ].includes(column.type);
    const rule: Record<string, unknown> = {
      required: true,
      message: `请${choice ? '选择' : '输入'}${column.label}`,
      trigger: choice ? 'change' : 'blur',
    };
    if (column.type === 'checkbox') rule.type = 'array';
    result[column.name] = rule as any;
  }
  return result;
});

const dialogTitle = computed(
  () => `${dialogTargetKey.value ? '编辑' : '新增'}${props.subtable.label}`,
);

function openDialog(row: SubTableRow | null): void {
  dialogTargetKey.value = row ? ensureKey(row) : null;
  const source = row ?? createRow();
  for (const key of Object.keys(dialogForm)) delete dialogForm[key];
  for (const column of formColumns.value) {
    const value = source[column.name];
    dialogForm[column.name] = value === undefined ? defaultValueOf(column) : value;
  }
  dialogVisible.value = true;
  void nextTick(() => dialogFormRef.value?.clearValidate());
}

function saveDialog(): void {
  void dialogFormRef.value?.validate(async (valid) => {
    if (!valid) return;
    if (dialogTargetKey.value) {
      const target = rows.value.find((row) => row.__key === dialogTargetKey.value);
      if (target) Object.assign(target, dialogForm);
    } else {
      const row = createRow();
      Object.assign(row, dialogForm);
      emit('update:modelValue', [...rows.value, row]);
    }
    dialogVisible.value = false;
  });
}

/* ---------------- 公共操作 ---------------- */

function handleAdd(): void {
  if (readonly.value) return;
  if (editingRow()) {
    ElMessage.warning('请先完成当前明细行的录入');
    return;
  }
  // 编辑目标已消失（弹窗关闭后明细被重置）时清掉残留编辑态，不要挡住新增
  if (editingKey.value !== null) resetEditing();
  if (props.subtable.mode === 'table') {
    const row = createRow();
    row.__isNew = true;
    emit('update:modelValue', [...rows.value, row]);
    startInline(row);
    return;
  }
  openDialog(null);
}

function handleEdit(row: SubTableRow): void {
  if (readonly.value) return;
  if (props.subtable.mode === 'table') {
    if (editingRow() && editingKey.value !== row.__key) {
      ElMessage.warning('请先完成当前明细行的录入');
      return;
    }
    startInline(row);
    return;
  }
  openDialog(row);
}

async function handleRemove(row: SubTableRow): Promise<void> {
  if (readonly.value) return;
  try {
    await ElMessageBox.confirm(`确定删除该条${props.subtable.label}明细吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  if (editingKey.value === row.__key) resetEditing();
  emit(
    'update:modelValue',
    rows.value.filter((item) => item.__key !== row.__key),
  );
}
</script>

<template>
  <div class="subtable-editor">
    <div class="subtable-editor__head">
      <span class="subtable-editor__title">{{ subtable.label }}</span>
      <!-- <el-tag size="small" type="info" effect="plain">{{ subtable.tableName }}</el-tag> -->
      <el-tag size="small" effect="plain">
        {{ subtable.mode === 'table' ? '行内录入' : '弹窗录入' }}
      </el-tag>
      <div class="subtable-editor__actions">
        <el-button v-if="!readonly" size="small" type="primary" plain @click="handleAdd">
          添加明细
        </el-button>
      </div>
    </div>

    <el-table :data="rows" size="default" border :empty-text="`暂无${subtable.label}明细`">
      <el-table-column type="index" label="#" width="48" align="center" />
      <el-table-column
        v-for="column in listColumns"
        :key="column.id"
        :label="column.label"
        :min-width="140"
        :show-overflow-tooltip="!isUploadColumn(column)"
      >
        <template #default="{ row }">
          <span v-if="isEditing(row)" class="subtable-editor__control" :style="controlBoxStyle(column)">
            <FieldControl
              :field="toField(column)"
              v-model="row[column.name]"
              :values="row"
              :code-labels="codeFieldLabels"
            />
          </span>
          <UploadCell
            v-else-if="isUploadColumn(column)"
            :type="column.type as 'image' | 'file'"
            :value="row[column.name]"
          />
          <span v-else>{{ formatValue(row[column.name], column, row) }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="!readonly" label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <template v-if="isEditing(row)">
            <el-button link type="primary" @click="commitInline(row)">确定</el-button>
            <el-button link @click="cancelInline(row)">取消</el-button>
          </template>
          <template v-else>
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="handleRemove(row)">删除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <AppDialog v-model="dialogVisible" :title="dialogTitle" width="640px">
      <el-form ref="dialogFormRef" :model="dialogForm" :rules="dialogRules" label-width="100px" size="small">
        <el-row :gutter="16">
          <el-col v-for="column in formColumns" :key="column.id" :span="column.span || 12">
            <el-form-item :label="column.label" :prop="column.name">
              <span class="subtable-editor__control" :style="controlBoxStyle(column)">
                <FieldControl
                  :field="toField(column)"
                  v-model="dialogForm[column.name]"
                  :values="dialogForm"
                  :code-labels="codeFieldLabels"
                />
              </span>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveDialog">确定</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped lang="scss">
.subtable-editor {
  // margin-top: 8px;
  // padding: 12px;
  // border: 1px solid var(--el-border-color-lighter);
  // border-radius: 6px;
  margin-bottom: 12px;
  background: var(--el-fill-color-blank);

  &__head {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__actions {
    margin-left: auto;
  }

  /* 控件宽度：外层按百分比限宽，内部控件 100% 跟随 */
  &__control {
    display: block;
    max-width: 100%;
  }
}
</style>
