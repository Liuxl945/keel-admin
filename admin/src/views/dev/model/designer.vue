<script setup lang="ts">
defineOptions({ name: 'DevModelDesign' });

import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import AppDialog from '@/components/AppDialog/index.vue';
import BasicDialog from '@/components/BasicDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import { useFillHeight } from '@/composables/useFillHeight';
import { listDataSourceOptions } from '@/api/dev-datasource';
import {
  getDevModel,
  previewDevModelDdl,
  updateDevModel,
  type UpdateDevModelPayload,
} from '@/api/dev-model';
import type {
  DevDataSourceOption,
  DevModelDetail,
  DevModelField,
  DevModelFieldType,
  DevModelStatus,
} from '@/types/dev-db';
import PublishDialog from './components/PublishDialog.vue';

const props = withDefaults(defineProps<{ modelId: number; visible?: boolean }>(), { visible: true });
const emit = defineEmits<{ close: [] }>();
const modelId = computed(() => props.modelId);
const { containerRef: tableContainerRef, height: tableHeight } = useFillHeight(260);

const loading = ref(true);
const saving = ref(false);
const dirty = ref(false);

const name = ref('');
const modelKey = ref('');
const connectionId = ref<number | null>(null);
const tableName = ref('');
const tableComment = ref('');
const status = ref<DevModelStatus>('DRAFT');
const createdTableAt = ref<string | null>(null);
const connectionOptions = ref<DevDataSourceOption[]>([]);
const connectionLabel = ref('');
const fields = ref<DevModelField[]>([]);

const sqlVisible = ref(false);
const sqlLoading = ref(false);
const sqlText = ref('');
const sqlWarnings = ref<string[]>([]);
const publishVisible = ref(false);

const fieldTypes: Array<{ label: string; value: DevModelFieldType }> = [
  { label: 'varchar', value: 'varchar' },
  { label: 'text', value: 'text' },
  { label: 'int', value: 'int' },
  { label: 'decimal', value: 'decimal' },
  { label: 'boolean', value: 'boolean' },
  { label: 'date', value: 'date' },
  { label: 'datetime', value: 'datetime' },
];

// 首次发布后连接不可再切，但表名、注释和字段可以重新编辑，发布时才同步数据库
const connectionLocked = computed(() => createdTableAt.value !== null);

type DisplayField = DevModelField & { __system?: boolean };

// id 是框架所有实体和表单设计器的固定主键，只展示不可改，
// 避免设计出与 BaseEntity / 关联表校验不兼容的表结构。
const systemIdRow: DisplayField = {
  label: '主键',
  columnName: 'id',
  fieldName: 'id',
  type: 'int',
  length: 0,
  precision: 0,
  scale: 0,
  nullable: false,
  unique: true,
  listVisible: true,
  formVisible: false,
  searchable: false,
  __system: true,
};

const displayFields = computed<DisplayField[]>(() => [systemIdRow, ...fields.value]);

function camel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part.charAt(0).toLowerCase() + part.slice(1) : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

function addField(): void {
  let index = fields.value.length + 1;
  let columnName = `field_${index}`;
  while (fields.value.some((field) => field.columnName === columnName)) {
    index += 1;
    columnName = `field_${index}`;
  }
  fields.value.push({
    label: `字段${index}`,
    columnName,
    fieldName: camel(columnName),
    type: 'varchar',
    length: 255,
    precision: 10,
    scale: 2,
    nullable: true,
    unique: false,
    listVisible: true,
    formVisible: true,
    searchable: false,
  });
  markDirty();
}

function removeField(row: DisplayField): void {
  const index = fields.value.indexOf(row);
  if (index < 0) return;
  fields.value.splice(index, 1);
  markDirty();
}

const dragSource = ref<number | null>(null);
const dragOverKey = ref<string | null>(null);

function rowDragKey(row: DisplayField): string {
  return row.__system ? '__system' : row.columnName;
}

function onDragStart(event: DragEvent, row: DisplayField): void {
  if (row.__system) {
    event.preventDefault();
    return;
  }
  dragSource.value = fields.value.indexOf(row);
  event.dataTransfer?.setData('text/plain', String(dragSource.value));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(event: DragEvent, row: DisplayField): void {
  if (dragSource.value === null) return;
  event.preventDefault();
  dragOverKey.value = rowDragKey(row);
}

function onDrop(event: DragEvent, row: DisplayField): void {
  event.preventDefault();
  const source = dragSource.value;
  dragSource.value = null;
  dragOverKey.value = null;
  if (source === null) return;

  const target = row.__system ? 0 : fields.value.indexOf(row);
  if (target < 0 || target === source) return;

  const [moved] = fields.value.splice(source, 1);
  // 拖到目标行即占据目标行的位置：向下拖时目标下移，向上拖时插到目标前
  fields.value.splice(target, 0, moved);
  markDirty();
}

function resetDrag(): void {
  dragSource.value = null;
  dragOverKey.value = null;
}

function rowClassName({ row }: { row: DisplayField }): string {
  const classes: string[] = [];
  if (row.__system) classes.push('system-row');
  if (dragOverKey.value === rowDragKey(row)) classes.push('drag-over-row');
  return classes.join(' ');
}

function markDirty(): void {
  if (!loading.value) dirty.value = true;
}

function applyDetail(detail: DevModelDetail): void {
  name.value = detail.name;
  modelKey.value = detail.modelKey;
  connectionId.value = detail.connectionId;
  tableName.value = detail.tableName;
  tableComment.value = detail.tableComment ?? '';
  status.value = detail.status;
  createdTableAt.value = detail.createdTableAt;
  connectionLabel.value = detail.connection
    ? `${detail.connection.name}（${detail.connection.dbType} / ${detail.connection.databaseName}）`
    : '-';
  fields.value = detail.fields.map((field) => ({ ...field }));
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    connectionOptions.value = await listDataSourceOptions().catch(() => []);
    const detail = await getDevModel(modelId.value);
    applyDetail(detail);
    await nextTick();
    dirty.value = false;
  } catch {
    emit('close');
  } finally {
    loading.value = false;
  }
}

function validateModel(): string | null {
  if (!name.value.trim()) return '请输入模型名称';
  if (!connectionId.value) return '请选择数据连接';
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(tableName.value.trim())) return '表名格式不正确';
  if (fields.value.length === 0) return '请至少设计一个字段';

  const columns = new Set<string>();
  const names = new Set<string>();
  for (const [index, field] of fields.value.entries()) {
    if (!field.label.trim()) return `第 ${index + 1} 个字段缺少说明`;
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(field.columnName.trim())) {
      return `字段「${field.label}」的列名格式不正确`;
    }
    if (columns.has(field.columnName.trim())) return `列名重复：${field.columnName}`;
    const fieldName = camel(field.columnName.trim());
    if (names.has(fieldName)) return `列名映射后的代码字段重复：${fieldName}`;
    columns.add(field.columnName.trim());
    names.add(fieldName);
  }
  return null;
}

function buildFields(): DevModelField[] {
  return fields.value.map((field) => ({
    label: field.label.trim(),
    columnName: field.columnName.trim(),
    // 字段名不再手工填写，统一由列名推导，避免列名与代码字段脱节
    fieldName: camel(field.columnName.trim()),
    type: field.type,
    length: field.length || 255,
    precision: field.precision || 10,
    scale: field.scale ?? 2,
    nullable: Boolean(field.nullable),
    unique: Boolean(field.unique),
    // 展示配置属于表单设计器，这里只保留后端生成代码的默认值
    listVisible: true,
    formVisible: true,
    searchable: false,
  }));
}

async function saveModel(showMessage = true): Promise<boolean> {
  const error = validateModel();
  if (error) {
    ElMessage.warning(error);
    return false;
  }

  saving.value = true;
  try {
    const payload: UpdateDevModelPayload = {
      name: name.value.trim(),
      tableName: tableName.value.trim(),
      tableComment: tableComment.value || null,
      fields: buildFields(),
    };
    // 表已发布后连接不可切换，避免把模型指向另一个库
    if (!connectionLocked.value) payload.connectionId = connectionId.value as number;
    const detail = await updateDevModel(modelId.value, payload);
    applyDetail(detail);
    // applyDetail 会触发深度 watch，等它执行完再清掉 dirty
    await nextTick();
    dirty.value = false;
    if (showMessage) ElMessage.success('模型已保存');
    return true;
  } catch {
    return false;
  } finally {
    saving.value = false;
  }
}

async function openSql(): Promise<void> {
  if (!(await saveModel(false))) return;
  sqlVisible.value = true;
  sqlLoading.value = true;
  sqlText.value = '';
  sqlWarnings.value = [];
  try {
    const result = await previewDevModelDdl(modelId.value);
    sqlText.value = result.sql || '-- 没有需要执行的结构变更';
    sqlWarnings.value = result.warnings;
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    sqlLoading.value = false;
  }
}

async function handlePublish(): Promise<void> {
  if (!(await saveModel(false))) return;
  publishVisible.value = true;
}

async function handlePublished(): Promise<void> {
  const detail = await getDevModel(modelId.value);
  applyDetail(detail);
  await nextTick();
  dirty.value = false;
}

async function goBack(): Promise<void> {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('当前有未保存的修改，确定离开吗？', '离开确认', {
        type: 'warning',
        confirmButtonText: '离开',
      });
    } catch {
      return;
    }
  }
  emit('close');
}

watch([fields, name, connectionId, tableName, tableComment], () => markDirty(), { deep: true });

onMounted(load);
</script>

<template>
  <BasicDialog
    :model-value="visible"
    fullscreen
    :mask="false"
    :show-close="false"
    :animated="false"
    :append-to-body="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    aria-label="数据建模设计器"
    @back="goBack"
  >
    <template #title>
      <el-input v-model="name" class="model-designer__name" maxlength="100" placeholder="模型名称" />
      <el-tag type="info" effect="plain">{{ modelKey }}</el-tag>
      <DictTag type="dev_model_status" :value="status" />
      <span class="text-muted">{{ connectionLabel }}</span>
    </template>

    <template #actions>
      <el-button :disabled="fields.length === 0" @click="openSql">预览变更 SQL</el-button>
      <el-button v-permission="'dev_model:update'" :loading="saving" @click="saveModel(true)">保存</el-button>
      <el-button
        v-permission="'dev_model:ddl'"
        type="primary"
        :disabled="fields.length === 0"
        @click="handlePublish"
      >
        发布
      </el-button>
    </template>

    <div v-loading="loading" class="model-designer__content">
      <div class="model-designer__settings">
        <el-form :inline="true" class="settings-form">
          <el-form-item label="数据连接">
            <el-select
              v-model="connectionId"
              style="width: 260px"
              placeholder="请选择连接"
              :disabled="connectionLocked"
            >
              <el-option
                v-for="item in connectionOptions"
                :key="item.id"
                :label="`${item.name}（${item.dbType} / ${item.databaseName}）`"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="表名">
            <el-input v-model="tableName" maxlength="64" style="width: 220px" />
          </el-form-item>
          <el-form-item label="表注释">
            <el-input v-model="tableComment" maxlength="255" style="width: 260px" />
          </el-form-item>
        </el-form>
        <el-alert
          v-if="connectionLocked"
          type="info"
          :closable="false"
          show-icon
          title="表已发布：表名、注释和字段可以重新编辑，点「发布」后才会同步到数据库；数据连接不可修改"
        />
      </div>

      <div class="model-designer__body">
        <div class="model-designer__toolbar">
          <span class="model-designer__title">字段设计</span>
          <el-button
            v-permission="'dev_model:update'"
            type="primary"
            plain
            size="small"
            @click="addField"
          >
            <el-icon><Plus /></el-icon>
            添加字段
          </el-button>
          <span class="text-muted">
            id 固定主键自增，created_at / updated_at / deleted_at 自动维护；列表、表单、搜索在「表单设计」中配置
          </span>
        </div>

        <div ref="tableContainerRef" class="model-designer__table">
          <el-table
            :data="displayFields"
            :height="tableHeight"
            :row-class-name="rowClassName"
            border
            size="small"
          >
            <el-table-column label="拖动" width="60" align="center">
              <template #default="{ row }">
                <div class="drag-cell" @dragover="onDragOver($event, row)" @drop="onDrop($event, row)">
                  <span
                    v-if="!row.__system"
                    class="drag-handle"
                    draggable="true"
                    title="拖动排序"
                    @dragstart="onDragStart($event, row)"
                    @dragend="resetDrag"
                  >
                    <el-icon><Rank /></el-icon>
                  </span>
                  <span v-else class="drag-handle is-locked" title="系统主键不可拖动">
                    <el-icon><Lock /></el-icon>
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column type="index" label="序号" width="60" align="center" />
            <el-table-column label="列名" width="170">
              <template #default="{ row }">
                <el-input
                  v-model="row.columnName"
                  size="small"
                  maxlength="64"
                  :disabled="row.__system"
                />
              </template>
            </el-table-column>
            <el-table-column label="类型" width="120">
              <template #default="{ row }">
                <el-select v-model="row.type" size="small" :disabled="row.__system">
                  <el-option v-for="type in fieldTypes" :key="type.value" :label="type.label" :value="type.value" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="长度" width="160">
              <template #default="{ row }">
                <el-input-number
                  v-if="row.type === 'varchar'"
                  v-model="row.length"
                  size="small"
                  :min="1"
                  :max="2000"
                  controls-position="right"
                  style="width: 100%"
                  :disabled="row.__system"
                />
                <div v-else-if="row.type === 'decimal'" class="decimal-inputs">
                  <el-input-number
                    v-model="row.precision"
                    size="small"
                    :min="1"
                    :max="65"
                    controls-position="right"
                    :disabled="row.__system"
                  />
                  <el-input-number
                    v-model="row.scale"
                    size="small"
                    :min="0"
                    :max="30"
                    controls-position="right"
                    :disabled="row.__system"
                  />
                </div>
                <span v-else class="text-muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="是否主键" width="90" align="center">
              <template #default="{ row }">
                <el-switch :model-value="Boolean(row.__system)" size="small" disabled />
              </template>
            </el-table-column>
            <el-table-column label="自增长ID" width="100" align="center">
              <template #default="{ row }">
                <el-switch :model-value="Boolean(row.__system)" size="small" disabled />
              </template>
            </el-table-column>
            <el-table-column label="允许空" width="80" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.nullable" size="small" :disabled="row.__system" />
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="180">
              <template #default="{ row }">
                <el-input
                  v-model="row.label"
                  size="small"
                  maxlength="100"
                  :disabled="row.__system"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" align="center" fixed="right">
              <template #default="{ row }">
                <span v-if="row.__system" class="text-muted">系统</span>
                <el-button
                  v-else
                  v-permission="'dev_model:update'"
                  link
                  type="danger"
                  @click="removeField(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>

    <AppDialog v-model="sqlVisible" title="发布变更 SQL 预览" width="760px">
      <div v-loading="sqlLoading">
        <el-alert
          v-if="sqlWarnings.length > 0"
          type="warning"
          :closable="false"
          show-icon
          class="sql-warning"
        >
          <ul class="sql-warning__list">
            <li v-for="warning in sqlWarnings" :key="warning">{{ warning }}</li>
          </ul>
        </el-alert>
        <el-scrollbar max-height="52vh">
          <pre class="sql-pre">{{ sqlText }}</pre>
        </el-scrollbar>
      </div>
      <template #footer>
        <el-button @click="sqlVisible = false">关闭</el-button>
      </template>
    </AppDialog>

    <PublishDialog
      v-model="publishVisible"
      :model-id="modelId"
      :model-name="name"
      @published="handlePublished"
    />
  </BasicDialog>
</template>

<style scoped lang="scss">
.model-designer__content {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.model-designer__name {
  width: 220px;
}

.model-designer__settings {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.settings-form {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
}

.settings-form :deep(.el-form-item) {
  margin: 0;
}

.model-designer__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 12px 14px;
}

.model-designer__toolbar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.model-designer__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.model-designer__table {
  flex: 1;
  min-height: 0;
}

.decimal-inputs {
  display: flex;
  gap: 6px;
}

.decimal-inputs :deep(.el-input-number) {
  width: 78px;
}

.drag-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 28px;
}

.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--el-text-color-secondary);
  cursor: grab;
  border-radius: 4px;
}

.drag-handle:hover {
  color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle.is-locked,
.drag-handle.is-disabled {
  color: var(--el-text-color-placeholder);
  cursor: not-allowed;
}

:deep(.system-row) {
  background: var(--el-fill-color-lighter);
}

:deep(.system-row td) {
  color: var(--el-text-color-secondary);
}

:deep(.drag-over-row) {
  outline: 1px dashed var(--el-color-primary);
  outline-offset: -1px;
}

.sql-warning {
  margin-bottom: 10px;
  align-items: flex-start;
}

.sql-warning__list {
  padding-left: 18px;
  margin: 4px 0 0;
  line-height: 1.8;
}

.sql-pre {
  padding: 14px 16px;
  margin: 0;
  overflow: auto;
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}
</style>
