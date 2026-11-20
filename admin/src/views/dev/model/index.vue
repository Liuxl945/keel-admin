<script setup lang="ts">
defineOptions({ name: 'DevModel' });

import { computed, onActivated, onDeactivated, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import { listDataSourceOptions } from '@/api/dev-datasource';
import { listSyncedTables, syncTables } from '@/api/dev-db-table';
import {
  createDevModel,
  deleteDevModel,
  importExistingModel,
  listDevModels,
  previewDevModelDdl,
  type DevModelQuery,
} from '@/api/dev-model';
import { formatDateTime } from '@/utils/datetime';
import type { DevDataSourceOption, DevModelSummary, SyncedTableSummary } from '@/types/dev-db';
import PublishDialog from './components/PublishDialog.vue';
import ModelDesigner from './designer.vue';

const route = useRoute();
const router = useRouter();
const tableRef = ref<any>(null);
const connectionOptions = ref<DevDataSourceOption[]>([]);
const connectionReady = ref(false);
const initialSearch = ref<Record<string, any>>({});

// 数据连接可能配置了默认项，所有新建入口优先选它
function defaultConnectionId(): number | null {
  return connectionOptions.value.find((item) => item.isDefault)?.id ?? connectionOptions.value[0]?.id ?? null;
}

/** 新建/导入入口统一取查询条件里的「数据连接」，取不到时回落默认连接 */
function currentConnectionId(): number | null {
  const connectionId = tableRef.value?.getSearchParams?.()?.connectionId;
  return typeof connectionId === 'number' ? connectionId : defaultConnectionId();
}

const columns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'name', label: '模型名称', width: 130 },
  { prop: 'modelKey', label: '模型编码', width: 150 },
  { prop: 'connectionName', label: '数据连接', width: 120, slot: 'connection' },
  { prop: 'dbType', label: '类型', width: 120, slot: 'dbType' },
  { prop: 'tableName', label: '表名', minWidth: 140 },
  { prop: 'status', label: '状态', width: 90, slot: 'status' },
  { prop: 'updatedBy', label: '最后操作人', width: 100, slot: 'updatedBy' },
  { prop: 'updatedAt', label: '更新时间', width: 160, slot: 'updatedAt' },
  { label: '操作', width: 220, fixed: 'right', slot: 'actions' },
];

const searchItems = computed<SearchItem[]>(() => [
  { prop: 'keyword', label: '关键字', placeholder: '名称 / 编码 / 表名' },
  {
    prop: 'connectionId',
    label: '数据连接',
    type: 'select',
    placeholder: '请选择数据连接',
    width: 240,
    clearable: false,
    autoSearch: true,
    options: connectionOptions.value.map((item) => ({
      label: `${item.name}（${item.dbType}）`,
      value: item.id,
    })),
  },
  {
    prop: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '草稿', value: 'DRAFT' },
      { label: '已发布', value: 'CREATED' },
    ],
  },
]);

function loadData(params: Record<string, unknown>) {
  return listDevModels(params as DevModelQuery);
}

const createVisible = ref(false);
const createSaving = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  name: '',
  modelKey: '',
  connectionId: null as number | null,
});

const createRules: FormRules = {
  name: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
  modelKey: [
    { required: true, message: '请输入模型编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]{2,49}$/,
      message: '小写字母开头，仅含小写字母、数字、下划线',
      trigger: 'blur',
    },
  ],
};

function connectionLabel(id: number | null): string {
  const item = connectionOptions.value.find((option) => option.id === id);
  return item ? `${item.name}（${item.dbType} / ${item.databaseName}）` : '-';
}

function openCreate(): void {
  createForm.name = '';
  createForm.modelKey = '';
  createForm.connectionId = currentConnectionId();
  createFormRef.value?.clearValidate();
  createVisible.value = true;
}

async function handleCreate(): Promise<void> {
  if (!createFormRef.value) return;
  const valid = await createFormRef.value.validate().catch(() => false);
  if (!valid || !createForm.connectionId) return;

  createSaving.value = true;
  try {
    const detail = await createDevModel({
      name: createForm.name.trim(),
      modelKey: createForm.modelKey.trim(),
      connectionId: createForm.connectionId,
      // 表名先默认等于模型编码，进入设计器后可统一修改，发布时才真正建表
      tableName: createForm.modelKey.trim(),
      tableComment: null,
      fields: [],
    });
    createVisible.value = false;
    ElMessage.success('模型已创建，进入设计器');
    openDesigner(detail.id);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    createSaving.value = false;
  }
}

const designerId = ref<number | null>(null);
// 页面切走时只隐藏弹窗，保留组件状态；切回来再恢复显示
const pageActive = ref(true);

function openDesigner(id: number): void {
  designerId.value = id;
  pageActive.value = true;
  void router.replace({ path: '/dev/model', query: { designId: String(id) } });
}

function handleDesignerClosed(): void {
  designerId.value = null;
  void router.replace({ path: '/dev/model' });
  tableRef.value?.reload();
}

/* ---------------- 从数据库导入 ---------------- */
const importVisible = ref(false);
const importConnectionId = ref<number | null>(null);
const importKeyword = ref('');
const importLoading = ref(false);
const importSyncing = ref(false);
const syncedTables = ref<SyncedTableSummary[]>([]);
const importFormVisible = ref(false);
const importing = ref(false);
const importFormRef = ref<FormInstance>();
const selectedTable = ref<SyncedTableSummary | null>(null);
const importForm = reactive({ name: '', modelKey: '' });

const importRules: FormRules = {
  name: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
  modelKey: [
    { required: true, message: '请输入模型编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]{2,49}$/,
      message: '小写字母开头，仅含小写字母、数字、下划线',
      trigger: 'blur',
    },
  ],
};

async function loadSyncedTables(): Promise<void> {
  if (!importConnectionId.value) {
    syncedTables.value = [];
    return;
  }
  importLoading.value = true;
  try {
    const result = await listSyncedTables({
      connectionId: importConnectionId.value,
      keyword: importKeyword.value || undefined,
      page: 1,
      pageSize: 200,
    });
    syncedTables.value = result.list;
  } catch {
    syncedTables.value = [];
  } finally {
    importLoading.value = false;
  }
}

async function openImport(): Promise<void> {
  if (connectionOptions.value.length === 0) {
    ElMessage.warning('请先创建数据连接');
    return;
  }
  importConnectionId.value = currentConnectionId();
  importKeyword.value = '';
  importVisible.value = true;
  await loadSyncedTables();
}

async function handleSyncTables(): Promise<void> {
  if (!importConnectionId.value) return;
  importSyncing.value = true;
  try {
    const result = await syncTables(importConnectionId.value);
    ElMessage.success(`已同步 ${result.count} 张表`);
    await loadSyncedTables();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    importSyncing.value = false;
  }
}

function chooseTable(row: SyncedTableSummary): void {
  if (!row.importable) return;
  selectedTable.value = row;
  importForm.name = row.tableComment || row.tableName;
  importForm.modelKey = row.tableName;
  importFormRef.value?.clearValidate();
  importFormVisible.value = true;
}

async function handleImport(): Promise<void> {
  if (!importFormRef.value || !selectedTable.value || !importConnectionId.value) return;
  const valid = await importFormRef.value.validate().catch(() => false);
  if (!valid) return;

  importing.value = true;
  try {
    const detail = await importExistingModel({
      name: importForm.name.trim(),
      modelKey: importForm.modelKey.trim(),
      connectionId: importConnectionId.value,
      tableName: selectedTable.value.tableName,
    });
    importFormVisible.value = false;
    importVisible.value = false;
    ElMessage.success('模型已导入，进入设计器');
    openDesigner(detail.id);
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    importing.value = false;
  }
}

watch(importConnectionId, () => {
  // 连接只在打开导入弹窗时从筛选条件带入，此处兜底刷新
  if (importVisible.value) void loadSyncedTables();
});

const sqlVisible = ref(false);
const sqlLoading = ref(false);
const sqlText = ref('');

async function openSql(row: DevModelSummary): Promise<void> {
  sqlVisible.value = true;
  sqlLoading.value = true;
  sqlText.value = '';
  try {
    const result = await previewDevModelDdl(row.id);
    sqlText.value = result.sql;
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    sqlLoading.value = false;
  }
}

const publishVisible = ref(false);
const publishId = ref<number | null>(null);
const publishName = ref('');

function openPublish(row: DevModelSummary): void {
  publishId.value = row.id;
  publishName.value = row.name;
  publishVisible.value = true;
}

function handlePublished(): void {
  tableRef.value?.reload();
}

async function handleDelete(row: DevModelSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除模型「${row.name}」吗？目标数据库中的表不会被删除。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
    );
  } catch {
    return;
  }
  try {
    await deleteDevModel(row.id);
    ElMessage.success('模型已删除');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

onMounted(async () => {
  connectionOptions.value = await listDataSourceOptions().catch(() => []);
  const defaultId = defaultConnectionId();
  initialSearch.value = defaultId ? { connectionId: defaultId } : {};
  connectionReady.value = true;

  // 兼容 /dev/model/design/:id 直接访问：路由重定向到这里后自动打开弹窗
  const queryId = Number(route.query.designId);
  if (Number.isInteger(queryId) && queryId > 0) {
    designerId.value = queryId;
  }
});

onActivated(() => {
  pageActive.value = true;
  if (connectionReady.value) tableRef.value?.reload();

  const queryId = Number(route.query.designId);
  if (!designerId.value && Number.isInteger(queryId) && queryId > 0) {
    designerId.value = queryId;
  }
  // 弹窗还开着时把 URL 补回 designId，刷新后也能恢复
  if (designerId.value && String(route.query.designId ?? '') !== String(designerId.value)) {
    void router.replace({ path: '/dev/model', query: { designId: String(designerId.value) } });
  }
});

// 页面失活时隐藏弹窗，但不销毁 designerId，保留缓存页和未保存编辑状态
onDeactivated(() => {
  pageActive.value = false;
});
</script>

<template>
  <div class="page">
    <ProTable
      v-if="connectionReady && connectionOptions.length > 0"
      ref="tableRef"
      :columns="columns"
      :search-items="searchItems"
      :initial-search="initialSearch"
      :request="loadData"
      row-key="id"
    >
      <template #toolbar>
        <el-button v-permission="'dev_model:create'" type="primary" @click="openCreate">新增模型</el-button>
        <el-button v-permission="'dev_model:create'" @click="openImport">从数据库导入</el-button>
        <span class="text-muted">
          新增 / 导入统一使用上方「数据连接」筛选；连接测试成功会自动同步库表
        </span>
      </template>

      <template #connection="{ row }">{{ row.connectionName || '-' }}</template>
      <template #dbType="{ row }">
        <DictTag v-if="row.dbType" type="dev_ds_type" :value="row.dbType" />
        <span v-else>-</span>
      </template>
      <template #status="{ row }"><DictTag type="dev_model_status" :value="row.status" /></template>
      <template #updatedBy="{ row }">{{ row.updatedBy || '-' }}</template>
      <template #updatedAt="{ row }">{{ formatDateTime(row.updatedAt) }}</template>

      <template #actions="{ row }">
        <el-button v-permission="'dev_model:update'" link type="primary" @click="openDesigner(row.id)">设计</el-button>
        <el-button link type="primary" @click="openSql(row)">SQL</el-button>
        <el-button
          v-if="row.status === 'DRAFT'"
          v-permission="'dev_model:ddl'"
          link
          type="success"
          @click="openPublish(row)"
        >
          发布
        </el-button>
        <el-button v-permission="'dev_model:delete'" link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <el-empty
      v-else-if="connectionReady"
      class="model-empty"
      description="请先创建数据连接，数据建模必须选择一个连接"
    >
      <el-button type="primary" @click="router.push('/dev/datasource')">去创建数据连接</el-button>
    </el-empty>

    <AppDialog v-model="createVisible" title="新增数据模型" width="600px">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="模型名称" prop="name">
          <el-input v-model="createForm.name" maxlength="100" placeholder="如 客户信息" />
        </el-form-item>
        <el-form-item label="模型编码" prop="modelKey">
          <el-input v-model="createForm.modelKey" maxlength="50" placeholder="如 customer_info" />
        </el-form-item>
      </el-form>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        :title="`模型将创建在数据连接「${connectionLabel(createForm.connectionId)}」，切换连接请使用列表上方的筛选条件`"
        description="创建后进入设计器，统一设置表名、表注释和字段；点「发布」后才会写入数据库"
      />
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSaving" @click="handleCreate">创建并设计</el-button>
      </template>
    </AppDialog>

    <AppDialog v-model="importVisible" title="从数据库导入模型" width="900px">
      <div class="import-filters">
        <span class="import-connection">
          数据连接：<strong>{{ connectionLabel(importConnectionId) }}</strong>
        </span>
        <el-input
          v-model="importKeyword"
          placeholder="搜索表名 / 注释"
          clearable
          style="width: 220px"
          @keyup.enter="loadSyncedTables"
        />
        <el-button :loading="importLoading" @click="loadSyncedTables">刷新</el-button>
        <el-button type="primary" plain :loading="importSyncing" @click="handleSyncTables">
          同步表结构
        </el-button>
      </div>

      <el-table
        v-loading="importLoading"
        :data="syncedTables"
        height="360"
        size="small"
        border
        :empty-text="importConnectionId ? '暂无同步表，请点击「同步表结构」' : '请选择数据连接'"
      >
        <el-table-column prop="tableName" label="表名" min-width="180" show-overflow-tooltip />
        <el-table-column prop="tableComment" label="注释" min-width="160">
          <template #default="{ row }">{{ row.tableComment || '-' }}</template>
        </el-table-column>
        <el-table-column prop="columnCount" label="字段数" width="80" align="center" />
        <el-table-column label="同步时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.syncedAt) }}</template>
        </el-table-column>
        <el-table-column label="兼容性" width="120" align="center">
          <template #default="{ row }">
            <el-tooltip :content="row.importMessage || '可直接导入生成 CRUD'" placement="top">
              <el-tag :type="row.importable ? 'success' : 'warning'" size="small">
                {{ row.importable ? '可导入' : '不兼容' }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :disabled="!row.importable"
              @click="chooseTable(row)"
            >
              导入
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <p class="import-tip">
        导入要求表具备 id 主键以及 created_at / updated_at / deleted_at 字段，且字段类型可映射到
        varchar/text/int/decimal/boolean/date/datetime。不兼容的表可先同步后手工调整表结构。
      </p>
      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
      </template>
    </AppDialog>

    <AppDialog v-model="importFormVisible" title="导入为数据模型" width="560px">
      <div class="import-table-info">
        目标表：<strong>{{ selectedTable?.tableName }}</strong>
        <span v-if="selectedTable?.tableComment">（{{ selectedTable.tableComment }}）</span>
      </div>
      <el-form ref="importFormRef" :model="importForm" :rules="importRules" label-width="100px">
        <el-form-item label="模型名称" prop="name">
          <el-input v-model="importForm.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="模型编码" prop="modelKey">
          <el-input v-model="importForm.modelKey" maxlength="50" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="handleImport">导入模型</el-button>
      </template>
    </AppDialog>

    <AppDialog v-model="sqlVisible" title="发布变更 SQL 预览" width="760px">
      <div v-loading="sqlLoading">
        <el-scrollbar max-height="56vh">
          <pre class="sql-pre">{{ sqlText }}</pre>
        </el-scrollbar>
      </div>
      <template #footer>
        <el-button @click="sqlVisible = false">关闭</el-button>
      </template>
    </AppDialog>

    <PublishDialog
      v-model="publishVisible"
      :model-id="publishId"
      :model-name="publishName"
      @published="handlePublished"
    />

    <ModelDesigner
      v-if="designerId"
      :key="designerId"
      :model-id="designerId"
      :visible="pageActive"
      @close="handleDesignerClosed"
    />
  </div>
</template>

<style scoped lang="scss">
.import-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.import-connection {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.import-tip {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.import-table-info {
  padding: 10px 12px;
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border-radius: 6px;
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
