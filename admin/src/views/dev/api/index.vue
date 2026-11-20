<script setup lang="ts">
defineOptions({ name: 'DevApi' });

import { onActivated, onDeactivated, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import ApiDesigner from './designer.vue';
import RunDialog from './components/RunDialog.vue';
import {
  createDevApi,
  deleteDevApi,
  listDevApis,
  publishDevApi,
} from '@/api/dev-api';
import { formatDateTime } from '@/utils/datetime';
import {
  DEV_API_CATEGORY_LABELS,
  emptyDevApiConfig,
  type DevApiCategory,
  type DevApiQuery,
  type DevApiSummary,
} from '@/types/dev-api';

const tableRef = ref<any>(null);

const columns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'name', label: '接口名称', minWidth: 160 },
  { prop: 'apiKey', label: '接口编码', minWidth: 150 },
  { prop: 'category', label: '类型', width: 110, slot: 'category' },
  { prop: 'action', label: 'SQL 动作', width: 100, slot: 'action' },
  { prop: 'tableName', label: '目标表', minWidth: 150, slot: 'table' },
  { prop: 'status', label: '状态', width: 100, slot: 'status' },
  { prop: 'version', label: '版本', width: 80, align: 'center' },
  { prop: 'updatedAt', label: '更新时间', width: 170, slot: 'updatedAt' },
  { label: '操作', width: 260, fixed: 'right', slot: 'actions' },
];

const searchItems: SearchItem[] = [
  { prop: 'keyword', label: '关键字', placeholder: '名称 / 编码 / 说明' },
  {
    prop: 'category',
    label: '类型',
    type: 'select',
    options: [
      { label: '静态数据', value: 'STATIC' },
      { label: 'SQL 操作', value: 'SQL' },
    ],
  },
  {
    prop: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '草稿', value: 'DRAFT' },
      { label: '已发布', value: 'PUBLISHED' },
    ],
  },
  {
    prop: 'action',
    label: '动作',
    type: 'select',
    options: [
      { label: '查询', value: 'QUERY' },
      { label: '增加', value: 'INSERT' },
      { label: '修改', value: 'UPDATE' },
      { label: '删除', value: 'DELETE' },
    ],
  },
];

function loadData(params: Record<string, unknown>) {
  return listDevApis(params as DevApiQuery);
}

const createVisible = ref(false);
const createSaving = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  name: '',
  apiKey: '',
  category: 'STATIC' as DevApiCategory,
  description: '',
});
const createRules: FormRules = {
  name: [{ required: true, message: '请输入接口名称', trigger: 'blur' }],
  apiKey: [
    { required: true, message: '请输入接口编码', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9_]{2,49}$/, message: '小写字母开头，仅含小写字母、数字、下划线', trigger: 'blur' },
  ],
};

const designerId = ref<number | null>(null);
const pageActive = ref(true);
const runVisible = ref(false);
const runApiId = ref<number | null>(null);

onActivated(() => {
  pageActive.value = true;
});
onDeactivated(() => {
  pageActive.value = false;
});

function openCreate(): void {
  Object.assign(createForm, { name: '', apiKey: '', category: 'STATIC', description: '' });
  createVisible.value = true;
}

async function handleCreate(): Promise<void> {
  const valid = await createFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  createSaving.value = true;
  try {
    const config = emptyDevApiConfig();
    // 静态接口给一个合法的空数组，进设计器后直接替换即可
    if (createForm.category === 'STATIC') config.staticData = '[]';
    const detail = await createDevApi({
      name: createForm.name.trim(),
      apiKey: createForm.apiKey.trim(),
      category: createForm.category,
      description: createForm.description || null,
      config,
    });
    createVisible.value = false;
    ElMessage.success('接口已创建，进入设计器');
    designerId.value = detail.id;
    pageActive.value = true;
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    createSaving.value = false;
  }
}

function openDesigner(row: DevApiSummary): void {
  designerId.value = row.id;
  pageActive.value = true;
}

function handleDesignerClosed(): void {
  designerId.value = null;
  tableRef.value?.reload();
}

function openRun(row: DevApiSummary): void {
  runApiId.value = row.id;
  runVisible.value = true;
}

async function handlePublish(row: DevApiSummary): Promise<void> {
  try {
    await publishDevApi(row.id);
    ElMessage.success('接口已发布');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

async function handleDelete(row: DevApiSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除接口「${row.name}」吗？`, '删除确认', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await deleteDevApi(row.id);
    ElMessage.success('接口已删除');
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
        <el-button v-permission="'dev_api:create'" type="primary" @click="openCreate">新增接口</el-button>
        <span class="text-muted">
          静态数据直接返回配置好的 JSON；SQL 操作关联数据连接与建模数据，参数绑定执行并按映射输出字段 key
        </span>
      </template>

      <template #category="{ row }"><DictTag type="dev_api_category" :value="row.category" /></template>
      <template #action="{ row }">
        <DictTag v-if="row.action" type="dev_api_action" :value="row.action" />
        <span v-else class="text-muted">-</span>
      </template>
      <template #table="{ row }">
        <span v-if="row.tableName">{{ row.tableName }}</span>
        <span v-else class="text-muted">-</span>
      </template>
      <template #status="{ row }"><DictTag type="dev_api_status" :value="row.status" /></template>
      <template #updatedAt="{ row }">{{ formatDateTime(row.updatedAt) }}</template>

      <template #actions="{ row }">
        <el-button v-permission="'dev_api:update'" link type="primary" @click="openDesigner(row)">设计</el-button>
        <el-button v-permission="'dev_api:run'" link type="primary" @click="openRun(row)">试运行</el-button>
        <el-button v-permission="'dev_api:publish'" link type="success" @click="handlePublish(row)">发布</el-button>
        <el-button v-permission="'dev_api:delete'" link type="danger" @click="handleDelete(row)">删除</el-button>
      </template>
    </ProTable>

    <AppDialog v-model="createVisible" title="新增数据接口" width="560px">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="接口名称" prop="name">
          <el-input v-model="createForm.name" maxlength="100" placeholder="如 订单状态选项" />
        </el-form-item>
        <el-form-item label="接口编码" prop="apiKey">
          <el-input v-model="createForm.apiKey" maxlength="50" placeholder="如 order_status_options" />
        </el-form-item>
        <el-form-item label="接口类型">
          <el-radio-group v-model="createForm.category">
            <el-radio-button v-for="(label, value) in DEV_API_CATEGORY_LABELS" :key="value" :value="value">
              {{ label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="接口说明">
          <el-input v-model="createForm.description" type="textarea" :rows="3" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSaving" @click="handleCreate">创建并设计</el-button>
      </template>
    </AppDialog>

    <ApiDesigner
      v-if="designerId"
      :key="designerId"
      :api-id="designerId"
      :visible="pageActive"
      @close="handleDesignerClosed"
      @saved="tableRef?.reload()"
    />

    <RunDialog v-if="runVisible" v-model="runVisible" :api-id="runApiId" />
  </div>
</template>
