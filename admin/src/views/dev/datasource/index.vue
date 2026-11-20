<script setup lang="ts">
defineOptions({ name: 'DevDatasource' });

import { reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import {
  createDataSource,
  deleteDataSource,
  listDataSources,
  testDataSource,
  updateDataSource,
  type DataSourcePayload,
  type DataSourceQuery,
} from '@/api/dev-datasource';
import { formatDateTime } from '@/utils/datetime';
import type { DevDataSourceItem, DevDataSourceType } from '@/types/dev-db';

const tableRef = ref<any>(null);

const columns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'name', label: '连接名称', width: 150 },
  { prop: 'code', label: '编码', width: 110 },
  { prop: 'dbType', label: '类型', width: 120, slot: 'dbType' },
  { prop: 'address', label: '地址', minWidth: 180, slot: 'address' },
  { prop: 'username', label: '用户名', width: 90 },
  { prop: 'status', label: '状态', width: 80, slot: 'status' },
  { prop: 'isDefault', label: '默认', width: 70, align: 'center', slot: 'isDefault' },
  { prop: 'lastTestAt', label: '最后测试', width: 190, slot: 'lastTest' },
  { label: '操作', width: 240, fixed: 'right', slot: 'actions' },
];

const searchItems: SearchItem[] = [
  { prop: 'keyword', label: '关键字', placeholder: '名称 / 编码 / 主机' },
  {
    prop: 'dbType',
    label: '类型',
    type: 'select',
    options: [
      { label: 'MySQL', value: 'mysql' },
      { label: 'PostgreSQL', value: 'postgres' },
    ],
  },
  {
    prop: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '启用', value: 'ENABLED' },
      { label: '禁用', value: 'DISABLED' },
    ],
  },
];

function loadData(params: Record<string, unknown>) {
  return listDataSources(params as DataSourceQuery);
}

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingId = ref<number | null>(null);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({
  name: '',
  code: '',
  dbType: 'postgres' as DevDataSourceType,
  host: '127.0.0.1',
  port: 5432,
  databaseName: '',
  username: '',
  password: '',
  status: 'ENABLED' as 'ENABLED' | 'DISABLED',
  isDefault: false,
  remark: '',
});
const hasPassword = ref(false);

const rules: FormRules = {
  name: [{ required: true, message: '请输入连接名称', trigger: 'blur' }],
  code: [
    { required: true, message: '请输入连接编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]{2,49}$/,
      message: '小写字母开头，仅含小写字母、数字、下划线',
      trigger: 'blur',
    },
  ],
  host: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口', trigger: 'blur' }],
  databaseName: [{ required: true, message: '请输入数据库名', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
};

function defaultPort(type: DevDataSourceType): number {
  return type === 'mysql' ? 3306 : 5432;
}

function handleDbTypeChange(value: DevDataSourceType): void {
  if (dialogMode.value === 'create' || form.port === 3306 || form.port === 5432) {
    form.port = defaultPort(value);
  }
}

function openCreate(): void {
  dialogMode.value = 'create';
  editingId.value = null;
  Object.assign(form, {
    name: '',
    code: '',
    dbType: 'postgres',
    host: '127.0.0.1',
    port: 5432,
    databaseName: '',
    username: '',
    password: '',
    status: 'ENABLED',
    isDefault: false,
    remark: '',
  });
  hasPassword.value = false;
  formRef.value?.clearValidate();
  dialogVisible.value = true;
}

function openEdit(row: DevDataSourceItem): void {
  dialogMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name,
    code: row.code,
    dbType: row.dbType,
    host: row.host,
    port: row.port,
    databaseName: row.databaseName,
    username: row.username,
    password: '',
    status: row.status,
    isDefault: row.isDefault,
    remark: row.remark ?? '',
  });
  hasPassword.value = row.hasPassword;
  formRef.value?.clearValidate();
  dialogVisible.value = true;
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    if (dialogMode.value === 'create') {
      const payload: DataSourcePayload = {
        name: form.name.trim(),
        code: form.code.trim(),
        dbType: form.dbType,
        host: form.host.trim(),
        port: form.port,
        databaseName: form.databaseName.trim(),
        username: form.username.trim(),
        password: form.password,
        status: form.status,
        isDefault: form.isDefault,
        remark: form.remark || null,
      };
      await createDataSource(payload);
      ElMessage.success('连接已创建');
    } else if (editingId.value) {
      await updateDataSource(editingId.value, {
        name: form.name.trim(),
        host: form.host.trim(),
        port: form.port,
        databaseName: form.databaseName.trim(),
        username: form.username.trim(),
        ...(form.password ? { password: form.password } : {}),
        status: form.status,
        isDefault: form.isDefault,
        remark: form.remark || null,
      });
      ElMessage.success('连接已保存');
    }
    dialogVisible.value = false;
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    saving.value = false;
  }
}

const testingId = ref<number | null>(null);

async function handleTest(row: DevDataSourceItem): Promise<void> {
  testingId.value = row.id;
  try {
    const result = await testDataSource(row.id);
    if (result.ok) {
      const syncedText =
        result.syncedTables !== undefined ? `，已同步 ${result.syncedTables} 张表` : '';
      ElMessage.success(`连接成功（${result.latencyMs}ms）${syncedText}`);
    } else {
      ElMessage.error(`连接失败：${result.message}`);
    }
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    testingId.value = null;
  }
}

async function handleSetDefault(row: DevDataSourceItem): Promise<void> {
  try {
    await updateDataSource(row.id, { isDefault: true });
    ElMessage.success(`已将「${row.name}」设为默认连接`);
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

async function handleDelete(row: DevDataSourceItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除连接「${row.name}」吗？该连接下的模型需要先删除。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    await deleteDataSource(row.id);
    ElMessage.success('连接已删除');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}
</script>

<template>
  <div class="page">
    <ProTable ref="tableRef" :columns="columns" :search-items="searchItems" :request="loadData" row-key="id">
      <template #toolbar>
        <el-button v-permission="'dev_ds:create'" type="primary" @click="openCreate">新增连接</el-button>
        <span class="text-muted">
          支持 MySQL / PostgreSQL，密码加密存储；可设置一个默认连接，表单设计和数据建模会自动选中
        </span>
      </template>

      <template #dbType="{ row }"><DictTag type="dev_ds_type" :value="row.dbType" /></template>
      <template #address="{ row }">
        {{ row.host }}:{{ row.port }}
        <span class="text-muted">/ {{ row.databaseName }}</span>
      </template>
      <template #status="{ row }"><DictTag type="sys_normal_disable" :value="row.status" /></template>
      <template #isDefault="{ row }">
        <el-tag v-if="row.isDefault" type="success" size="small">默认</el-tag>
        <span v-else class="text-muted">-</span>
      </template>
      <template #lastTest="{ row }">
        <div v-if="row.lastTestAt" class="last-test">
          <el-tag :type="row.lastTestStatus === 'SUCCESS' ? 'success' : 'danger'" size="small">
            {{ row.lastTestStatus === 'SUCCESS' ? '成功' : '失败' }}
          </el-tag>
          <span class="text-muted last-test__time">{{ formatDateTime(row.lastTestAt) }}</span>
        </div>
        <span v-else class="text-muted">未测试</span>
      </template>

      <template #actions="{ row }">
        <el-button
          v-permission="'dev_ds:test'"
          link
          type="primary"
          :loading="testingId === row.id"
          @click="handleTest(row)"
        >
          测试
        </el-button>
        <el-button
          v-if="!row.isDefault"
          v-permission="'dev_ds:update'"
          link
          type="success"
          @click="handleSetDefault(row)"
        >
          设为默认
        </el-button>
        <el-button v-permission="'dev_ds:update'" link type="primary" @click="openEdit(row)">编辑</el-button>
        <el-button v-permission="'dev_ds:delete'" link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <AppDialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增数据连接' : '编辑数据连接'" width="640px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="连接名称" prop="name">
              <el-input v-model="form.name" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="连接编码" prop="code">
              <el-input v-model="form.code" :disabled="dialogMode === 'edit'" maxlength="50" placeholder="如 main_db" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="数据库类型">
              <el-select
                v-model="form.dbType"
                :disabled="dialogMode === 'edit'"
                style="width: 100%"
                @change="handleDbTypeChange"
              >
                <el-option label="PostgreSQL" value="postgres" />
                <el-option label="MySQL" value="mysql" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-radio-group v-model="form.status">
                <el-radio value="ENABLED">启用</el-radio>
                <el-radio value="DISABLED">禁用</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="默认连接">
              <el-switch v-model="form.isDefault" />
              <span class="default-tip">表单/建模下拉默认选中</span>
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <el-form-item label="主机地址" prop="host">
              <el-input v-model="form.host" maxlength="255" placeholder="127.0.0.1" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="端口" prop="port">
              <el-input-number v-model="form.port" :min="1" :max="65535" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="数据库名" prop="databaseName">
              <el-input v-model="form.databaseName" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="用户名" prop="username">
              <el-input v-model="form.username" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="密码">
              <el-input
                v-model="form.password"
                type="password"
                show-password
                maxlength="200"
                :placeholder="dialogMode === 'edit' && hasPassword ? '留空表示不修改密码' : '请输入数据库密码'"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped lang="scss">
.last-test {
  display: flex;
  gap: 8px;
  align-items: center;
}

.last-test__time {
  font-size: 12px;
}

.default-tip {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
