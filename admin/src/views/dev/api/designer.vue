<script setup lang="ts">
defineOptions({ name: 'DevApiDesigner' });

import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import BasicDialog from '@/components/BasicDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import RunDialog from './components/RunDialog.vue';
import { getDevApi, publishDevApi, updateDevApi } from '@/api/dev-api';
import { listDataSourceOptions } from '@/api/dev-datasource';
import { listDevModels } from '@/api/dev-model';
import { getSyncedTable, listSyncedTables } from '@/api/dev-db-table';
import { formatDateTime } from '@/utils/datetime';
import type { DevDataSourceOption } from '@/types/dev-db';
import type { DevModelSummary, SyncedColumn } from '@/types/dev-db';
import type {
  DevApiAction,
  DevApiConfig,
  DevApiParam,
  DevApiParamType,
  DevApiSummary,
  UpdateDevApiPayload,
} from '@/types/dev-api';
import {
  DEV_API_ACTION_LABELS,
  DEV_API_CATEGORY_LABELS,
  DEV_API_PARAM_TYPE_LABELS,
  emptyDevApiConfig,
} from '@/types/dev-api';

const props = defineProps<{ visible: boolean; apiId: number }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const dirty = ref(false);
const initializing = ref(true);
const activeTab = ref('basic');
const runVisible = ref(false);

const form = reactive({
  name: '',
  apiKey: '',
  category: 'STATIC' as DevApiSummary['category'],
  description: '',
  status: 'DRAFT' as DevApiSummary['status'],
  version: 1,
  connectionId: null as number | null,
  modelId: null as number | null,
  tableName: '' as string | null,
  action: null as DevApiAction | null,
  publishedAt: null as string | null,
  updatedAt: '',
});

const config = reactive<DevApiConfig>(emptyDevApiConfig());
const connectionOptions = ref<DevDataSourceOption[]>([]);
const modelOptions = ref<DevModelSummary[]>([]);
const tableColumns = ref<SyncedColumn[]>([]);

const connectionLabel = computed(
  () => connectionOptions.value.find((item) => item.id === form.connectionId)?.name ?? '-',
);
const modelLabel = computed(() => modelOptions.value.find((item) => item.id === form.modelId)?.name ?? '-');
const actionLabel = computed(() => (form.action ? DEV_API_ACTION_LABELS[form.action] : '-'));
const isSql = computed(() => form.category === 'SQL');

/** 与后端同一套规则：字符串/引号标识符里的 :xxx 不算命名参数，PG 的 ::type 也不算 */
function extractParams(sql: string): string[] {
  const masked = sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`/g, '');
  const found = masked.match(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g) ?? [];
  return [...new Set(found.map((item) => item.slice(1)))];
}

function toCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function newParam(key: string): DevApiParam {
  return { key, label: '', type: 'string', required: false, defaultValue: '', sampleValue: '' };
}

/** 参数表以 SQL 模板为准：新增的补齐，删掉的占位符对应行自动移除 */
function syncParams(): void {
  const used = extractParams(config.sql);
  const existing = new Map(config.params.map((item) => [item.key, item]));
  config.params = used.map((key) => existing.get(key) ?? newParam(key));
  ElMessage.success(`已同步 ${config.params.length} 个参数`);
}

function syncParamsSilently(): void {
  const used = extractParams(config.sql);
  const existing = new Map(config.params.map((item) => [item.key, item]));
  config.params = used.map((key) => existing.get(key) ?? newParam(key));
}

function generateSql(): void {
  if (!form.tableName) {
    ElMessage.warning('请先选择建模数据');
    return;
  }
  const systemColumns = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);
  const columns = tableColumns.value.filter((item) => !systemColumns.has(item.columnName));
  const first = columns[0]?.columnName ?? 'id';
  const second = columns[1]?.columnName ?? first;
  const table = form.tableName;
  switch (form.action) {
    case 'QUERY':
      config.sql = `SELECT * FROM ${table}\nWHERE ${first} = :${toCamel(first)}`;
      break;
    case 'INSERT':
      config.sql = `INSERT INTO ${table} (${first}, ${second})\nVALUES (:${toCamel(first)}, :${toCamel(second)})`;
      break;
    case 'UPDATE':
      config.sql = `UPDATE ${table} SET ${second} = :${toCamel(second)}\nWHERE ${first} = :${toCamel(first)}`;
      break;
    case 'DELETE':
      config.sql = `DELETE FROM ${table}\nWHERE ${first} = :${toCamel(first)}`;
      break;
    default:
      ElMessage.warning('请先选择 SQL 动作');
      return;
  }
  syncParamsSilently();
  ElMessage.success('已生成示例 SQL，请按实际条件调整');
}

function addParam(): void {
  const index = config.params.length + 1;
  config.params.push(newParam(`param${index}`));
}

function removeParam(index: number): void {
  config.params.splice(index, 1);
}

function fillMappings(): void {
  const existing = new Map(config.fieldMappings.map((item) => [item.columnName, item]));
  config.fieldMappings = tableColumns.value
    .filter((column) => column.columnName !== 'deleted_at')
    .map(
      (column) =>
        existing.get(column.columnName) ?? {
          columnName: column.columnName,
          outputKey: toCamel(column.columnName),
          label: column.comment || column.columnName,
          hidden: false,
        },
    );
  ElMessage.success(`已填充 ${config.fieldMappings.length} 个字段映射`);
}

function addMapping(): void {
  config.fieldMappings.push({ columnName: '', outputKey: '', label: '', hidden: false });
}

function removeMapping(index: number): void {
  config.fieldMappings.splice(index, 1);
}

function formatStaticJson(): void {
  try {
    config.staticData = JSON.stringify(JSON.parse(config.staticData), null, 2);
    ElMessage.success('JSON 已格式化');
  } catch {
    ElMessage.warning('静态数据不是合法 JSON，无法格式化');
  }
}

function validateStaticJson(): void {
  try {
    const parsed = JSON.parse(config.staticData) as unknown;
    if (parsed === null || typeof parsed !== 'object') {
      ElMessage.warning('静态数据必须是 JSON 对象或数组');
      return;
    }
    const count = Array.isArray(parsed) ? parsed.length : 1;
    ElMessage.success(`JSON 合法，共 ${count} 条数据`);
  } catch {
    ElMessage.warning('静态数据不是合法 JSON');
  }
}

async function loadModels(connectionId: number | null): Promise<void> {
  if (!connectionId) {
    modelOptions.value = [];
    return;
  }
  try {
    const result = await listDevModels({ connectionId, page: 1, pageSize: 200 });
    modelOptions.value = result.list;
  } catch {
    modelOptions.value = [];
  }
}

async function loadTableColumns(connectionId: number | null, tableName: string | null): Promise<void> {
  tableColumns.value = [];
  if (!connectionId || !tableName) return;
  try {
    const result = await listSyncedTables({ connectionId, pageSize: 200 });
    const target = result.list.find((item) => item.tableName === tableName);
    if (!target) return;
    const detail = await getSyncedTable(target.id);
    tableColumns.value = detail.columns;
  } catch {
    tableColumns.value = [];
  }
}

async function load(): Promise<void> {
  initializing.value = true;
  loading.value = true;
  try {
    const [detail, connections] = await Promise.all([getDevApi(props.apiId), listDataSourceOptions()]);
    connectionOptions.value = connections;
    Object.assign(form, {
      name: detail.name,
      apiKey: detail.apiKey,
      category: detail.category,
      description: detail.description ?? '',
      status: detail.status,
      version: detail.version,
      connectionId: detail.connectionId,
      modelId: detail.modelId,
      tableName: detail.tableName,
      action: detail.action,
      publishedAt: detail.publishedAt,
      updatedAt: detail.updatedAt,
    });
    Object.assign(config, {
      staticData: detail.config.staticData,
      sql: detail.config.sql,
      params: detail.config.params.map((item) => ({ ...item })),
      fieldMappings: detail.config.fieldMappings.map((item) => ({ ...item })),
      dataProcess: { ...detail.config.dataProcess },
    });
    await loadModels(form.connectionId);
    await loadTableColumns(form.connectionId, form.tableName);
    dirty.value = false;
  } catch {
    emit('close');
  } finally {
    loading.value = false;
    // 等 watch 把「加载赋值」这批变更消费掉再开始跟踪，避免刚进设计器就误标未保存
    await nextTick();
    initializing.value = false;
    dirty.value = false;
  }
}

watch(
  () => props.visible,
  (open) => {
    if (open) void load();
  },
  { immediate: true },
);

watch([form, config], () => {
  if (!initializing.value) dirty.value = true;
}, { deep: true });

function handleConnectionChange(): void {
  form.modelId = null;
  form.tableName = null;
  tableColumns.value = [];
  void loadModels(form.connectionId);
}

function handleModelChange(): void {
  const model = modelOptions.value.find((item) => item.id === form.modelId);
  form.tableName = model?.publishedTableName || model?.tableName || null;
  config.fieldMappings = [];
  void loadTableColumns(form.connectionId, form.tableName);
}

function buildPayload(): UpdateDevApiPayload {
  return {
    name: form.name.trim(),
    description: form.description || null,
    connectionId: form.connectionId,
    modelId: form.modelId,
    tableName: form.tableName,
    action: form.action,
    config: {
      staticData: config.staticData,
      sql: config.sql,
      params: config.params.map((item) => ({ ...item })),
      fieldMappings: config.fieldMappings.map((item) => ({ ...item })),
      dataProcess: { ...config.dataProcess },
    },
  };
}

function validate(): string | null {
  if (!form.name.trim()) return '请输入接口名称';
  if (!isSql.value) {
    if (!config.staticData.trim()) return '请填写静态数据 JSON';
    try {
      const parsed = JSON.parse(config.staticData) as unknown;
      if (parsed === null || typeof parsed !== 'object') return '静态数据必须是 JSON 对象或数组';
    } catch {
      return '静态数据不是合法 JSON';
    }
    return null;
  }
  if (!form.connectionId) return '请选择数据连接';
  if (!form.modelId) return '请选择建模数据';
  if (!form.tableName) return '请选择目标表';
  if (!form.action) return '请选择 SQL 动作';
  if (!config.sql.trim()) return '请填写 SQL 模板';

  const declared = new Set(config.params.map((item) => item.key));
  const missing = extractParams(config.sql).filter((key) => !declared.has(key));
  if (missing.length > 0) return `SQL 中的参数 :${missing[0]} 尚未声明，请点「同步参数」`;

  const keys = new Set<string>();
  for (const item of config.fieldMappings) {
    if (!item.columnName) return '字段映射里有未选择的结果列';
    if (!item.outputKey.trim()) return '字段映射的输出 key 不能为空';
    if (keys.has(item.outputKey)) return `输出 key 重复：${item.outputKey}`;
    keys.add(item.outputKey);
  }
  if (config.dataProcess.paging && form.action !== 'QUERY') return '只有查询动作可以开启分页';
  return null;
}

async function save(showMessage = true): Promise<boolean> {
  const error = validate();
  if (error) {
    ElMessage.warning(error);
    return false;
  }
  saving.value = true;
  try {
    const detail = await updateDevApi(props.apiId, buildPayload());
    form.status = detail.status;
    form.version = detail.version;
    form.publishedAt = detail.publishedAt;
    dirty.value = false;
    emit('saved');
    if (showMessage) ElMessage.success('接口已保存');
    return true;
  } catch {
    return false;
  } finally {
    saving.value = false;
  }
}

async function handlePublish(): Promise<void> {
  if (!(await save(false))) return;
  publishing.value = true;
  try {
    const detail = await publishDevApi(props.apiId);
    form.status = detail.status;
    form.version = detail.version;
    form.publishedAt = detail.publishedAt;
    ElMessage.success('接口已发布');
    emit('saved');
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    publishing.value = false;
  }
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
    aria-label="数据接口设计器"
    @back="goBack"
  >
    <template #title>
      <el-input v-model="form.name" class="api-designer__name" maxlength="100" placeholder="接口名称" />
      <el-tag type="info" effect="plain">{{ form.apiKey }}</el-tag>
      <el-tag effect="plain">{{ DEV_API_CATEGORY_LABELS[form.category] }}</el-tag>
      <DictTag type="dev_api_status" :value="form.status" />
      <span class="text-muted">v{{ form.version }}</span>
    </template>

    <template #center>
      <span class="text-muted api-designer__center">
        {{ isSql ? `${connectionLabel} / ${modelLabel} / ${form.tableName || '-'} / ${actionLabel}` : '静态数据' }}
      </span>
    </template>

    <template #actions>
      <el-button @click="runVisible = true">试运行</el-button>
      <el-button v-permission="'dev_api:update'" :loading="saving" @click="save()">保存</el-button>
      <el-button v-permission="'dev_api:publish'" type="primary" :loading="publishing" @click="handlePublish">
        发布
      </el-button>
    </template>

    <el-scrollbar v-loading="loading" class="api-designer__scroll" height="100%">
      <div class="api-designer">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="基本信息" name="basic">
            <el-form label-width="120px" class="api-designer__form">
              <el-row :gutter="16">
                <el-col :span="12">
                  <el-form-item label="接口名称"><el-input v-model="form.name" maxlength="100" /></el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="接口编码"><el-input :model-value="form.apiKey" disabled /></el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="接口类型">
                    <el-tag effect="plain">{{ DEV_API_CATEGORY_LABELS[form.category] }}</el-tag>
                    <span class="api-designer__hint">创建后不可修改</span>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="状态">
                    <DictTag type="dev_api_status" :value="form.status" />
                    <span class="api-designer__hint">v{{ form.version }}</span>
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item label="接口说明">
                    <el-input v-model="form.description" type="textarea" :rows="3" maxlength="500" placeholder="说明这个接口的用途" />
                  </el-form-item>
                </el-col>
              </el-row>

              <div class="api-designer__section-title">关联信息</div>
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="数据连接">{{ connectionLabel }}</el-descriptions-item>
                <el-descriptions-item label="建模数据">{{ modelLabel }}</el-descriptions-item>
                <el-descriptions-item label="目标表">{{ form.tableName || '-' }}</el-descriptions-item>
                <el-descriptions-item label="SQL 动作">{{ actionLabel }}</el-descriptions-item>
                <el-descriptions-item label="发布时间">
                  {{ form.publishedAt ? formatDateTime(form.publishedAt) : '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="最后更新">
                  {{ form.updatedAt ? formatDateTime(form.updatedAt) : '-' }}
                </el-descriptions-item>
              </el-descriptions>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="数据配置" name="data">
            <template v-if="!isSql">
              <div class="api-designer__toolbar">
                <span class="api-designer__section-title">静态数据（JSON）</span>
                <el-button size="small" @click="formatStaticJson">格式化</el-button>
                <el-button size="small" @click="validateStaticJson">校验</el-button>
                <span class="text-muted">填 JSON 对象或数组，运行时直接返回；数据处理里可分页、映射字段 key</span>
              </div>
              <el-input
                v-model="config.staticData"
                type="textarea"
                :rows="18"
                spellcheck="false"
                placeholder='[{"label":"启用","value":"ENABLED"}]'
                class="api-designer__code"
              />
            </template>

            <template v-else>
              <el-form label-width="110px" class="api-designer__form">
                <el-row :gutter="16">
                  <el-col :span="8">
                    <el-form-item label="数据连接">
                      <el-select
                        v-model="form.connectionId"
                        placeholder="请选择数据连接"
                        style="width: 100%"
                        @change="handleConnectionChange"
                      >
                        <el-option
                          v-for="item in connectionOptions"
                          :key="item.id"
                          :label="`${item.name}（${item.databaseName}）`"
                          :value="item.id"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="建模数据">
                      <el-select
                        v-model="form.modelId"
                        placeholder="请选择建模数据"
                        style="width: 100%"
                        @change="handleModelChange"
                      >
                        <el-option
                          v-for="item in modelOptions"
                          :key="item.id"
                          :label="`${item.name}（${item.tableName}）`"
                          :value="item.id"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="目标表">
                      <el-input :model-value="form.tableName || ''" disabled placeholder="由建模数据带出" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item label="SQL 动作">
                  <el-radio-group v-model="form.action">
                    <el-radio-button v-for="(label, value) in DEV_API_ACTION_LABELS" :key="value" :value="value">
                      {{ label }}
                    </el-radio-button>
                  </el-radio-group>
                  <span class="api-designer__hint">动作决定 SQL 允许的语句类型（查询=SELECT / 增加=INSERT / 修改=UPDATE / 删除=DELETE）</span>
                </el-form-item>
              </el-form>

              <div class="api-designer__toolbar">
                <span class="api-designer__section-title">SQL 模板</span>
                <el-button size="small" @click="generateSql">生成示例 SQL</el-button>
                <el-button size="small" type="primary" plain @click="syncParams">同步参数</el-button>
                <span class="text-muted">条件值一律写 :name 命名参数；仅单条语句，不允许注释和 DDL</span>
              </div>
              <el-input
                v-model="config.sql"
                type="textarea"
                :rows="8"
                spellcheck="false"
                placeholder="SELECT * FROM orders WHERE order_name = :orderName"
                class="api-designer__code"
              />

              <div class="api-designer__toolbar">
                <span class="api-designer__section-title">参数配置</span>
                <el-button size="small" @click="addParam">添加参数</el-button>
                <span class="text-muted">示例值用于「试运行」预填；必填为空时拒绝执行</span>
              </div>
              <el-table :data="config.params" border size="small" class="api-designer__table">
                <el-table-column label="参数名" width="150">
                  <template #default="{ row }"><code>:{{ row.key }}</code></template>
                </el-table-column>
                <el-table-column label="说明" min-width="130">
                  <template #default="{ row }"><el-input v-model="row.label" size="small" /></template>
                </el-table-column>
                <el-table-column label="类型" width="120">
                  <template #default="{ row }">
                    <el-select v-model="row.type" size="small">
                      <el-option
                        v-for="(label, value) in DEV_API_PARAM_TYPE_LABELS"
                        :key="value"
                        :label="label"
                        :value="value as DevApiParamType"
                      />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="必填" width="70" align="center">
                  <template #default="{ row }"><el-switch v-model="row.required" size="small" /></template>
                </el-table-column>
                <el-table-column label="默认值" min-width="120">
                  <template #default="{ row }"><el-input v-model="row.defaultValue" size="small" /></template>
                </el-table-column>
                <el-table-column label="示例值" min-width="120">
                  <template #default="{ row }"><el-input v-model="row.sampleValue" size="small" /></template>
                </el-table-column>
                <el-table-column label="操作" width="70" align="center">
                  <template #default="{ $index }">
                    <el-button link type="danger" @click="removeParam($index)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>

              <div class="api-designer__section-title api-designer__columns-title">目标表可用字段（{{ tableColumns.length }}）</div>
              <div class="api-designer__columns">
                <el-tag v-for="column in tableColumns" :key="column.columnName" size="small" effect="plain">
                  {{ column.columnName }}<span v-if="column.comment"> · {{ column.comment }}</span>
                </el-tag>
                <span v-if="!tableColumns.length" class="text-muted">尚未同步表结构，请先在「数据连接」里同步库表</span>
              </div>
            </template>
          </el-tab-pane>

          <el-tab-pane label="数据处理" name="process">
            <el-form label-width="130px" class="api-designer__form">
              <el-row :gutter="16">
                <el-col :span="8">
                  <el-form-item label="返回形态">
                    <el-select v-model="config.dataProcess.returnMode" style="width: 100%">
                      <el-option label="列表 list" value="list" />
                      <el-option label="单条 one" value="one" />
                      <el-option label="计数 count" value="count" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="开启分页">
                    <el-switch v-model="config.dataProcess.paging" :disabled="isSql && form.action !== 'QUERY'" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="每页条数">
                    <el-input-number v-model="config.dataProcess.pageSize" :min="1" :max="200" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="最大返回行数">
                    <el-input-number v-model="config.dataProcess.maxRows" :min="1" :max="5000" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="仅输出映射字段">
                    <el-switch v-model="config.dataProcess.mappedOnly" />
                  </el-form-item>
                </el-col>
                <template v-if="isSql">
                  <el-col :span="8">
                    <el-form-item label="排序字段">
                      <el-select v-model="config.dataProcess.orderBy" clearable placeholder="不排序" style="width: 100%">
                        <el-option
                          v-for="column in tableColumns"
                          :key="column.columnName"
                          :label="`${column.columnName}${column.comment ? ` · ${column.comment}` : ''}`"
                          :value="column.columnName"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="排序方向">
                      <el-radio-group v-model="config.dataProcess.orderDir">
                        <el-radio value="ASC">升序</el-radio>
                        <el-radio value="DESC">降序</el-radio>
                      </el-radio-group>
                    </el-form-item>
                  </el-col>
                </template>
              </el-row>
              <el-alert
                v-if="isSql && config.dataProcess.paging"
                type="info"
                :closable="false"
                show-icon
                title="分页由服务端追加 LIMIT/OFFSET，SQL 模板里不要再写 LIMIT；会额外执行一次 COUNT 查询"
              />
            </el-form>

            <div class="api-designer__toolbar">
              <span class="api-designer__section-title">返回字段映射</span>
              <el-button size="small" @click="fillMappings">从表字段填充</el-button>
              <el-button size="small" @click="addMapping">添加映射</el-button>
              <el-button size="small" type="danger" plain @click="config.fieldMappings = []">清空</el-button>
              <span class="text-muted">把结果列名改成业务需要的 key；隐藏的列不会出现在返回里</span>
            </div>
            <el-table :data="config.fieldMappings" border size="small" class="api-designer__table">
              <el-table-column label="结果列" min-width="190">
                <template #default="{ row }">
                  <el-select v-model="row.columnName" filterable placeholder="选择列" size="small" style="width: 100%">
                    <el-option
                      v-for="column in tableColumns"
                      :key="column.columnName"
                      :label="`${column.columnName}${column.comment ? ` · ${column.comment}` : ''}`"
                      :value="column.columnName"
                    />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="输出 key" min-width="180">
                <template #default="{ row }"><el-input v-model="row.outputKey" size="small" placeholder="如 orderName" /></template>
              </el-table-column>
              <el-table-column label="字段说明" min-width="150">
                <template #default="{ row }"><el-input v-model="row.label" size="small" /></template>
              </el-table-column>
              <el-table-column label="隐藏" width="80" align="center">
                <template #default="{ row }"><el-switch v-model="row.hidden" size="small" /></template>
              </el-table-column>
              <el-table-column label="操作" width="70" align="center">
                <template #default="{ $index }">
                  <el-button link type="danger" @click="removeMapping($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-scrollbar>
  </BasicDialog>

  <RunDialog v-if="runVisible" v-model="runVisible" :api-id="props.apiId" />
</template>

<style scoped lang="scss">
.api-designer {
  padding: 16px 20px 28px;
}

.api-designer__scroll {
  height: 100%;
}

.api-designer__name {
  width: 220px;
}

.api-designer__center {
  font-size: 13px;
}

.api-designer__form {
  max-width: 1100px;
}

.api-designer__section-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 4px 0 10px;
}

.api-designer__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 8px 0 12px;

  .api-designer__section-title {
    margin: 0 6px 0 0;
  }
}

.api-designer__hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.api-designer__code {
  font-family: var(--el-font-family-mono, monospace);
}

.api-designer__table {
  width: 100%;
}

.api-designer__columns-title {
  margin-top: 18px;
}

.api-designer__columns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
