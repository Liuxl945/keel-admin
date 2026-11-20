<script setup lang="ts">
defineOptions({ name: 'SystemDict' });

import { nextTick, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import {
  createDictData,
  createDictType,
  deleteDictData,
  deleteDictType,
  listDictData,
  listDictTypeOptions,
  listDictTypes,
  updateDictData,
  updateDictType,
  type DictDataPayload,
  type DictDataQuery,
  type DictTypePayload,
  type DictTypeQuery,
} from '@/api/dict';
import { useDictStore } from '@/stores/dict';
import { formatDateTime } from '@/utils/datetime';
import type { AccountStatus, DictData, DictTagType, DictType, DictTypeOption } from '@/types/entities';

const dictStore = useDictStore();
const typeTableRef = ref<any>(null);
const dataTableRef = ref<any>(null);
const selectedType = ref<DictTypeOption | null>(null);

const typeColumns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'dictName', label: '字典名称', minWidth: 160 },
  { prop: 'dictType', label: '字典类型', minWidth: 180 },
  { prop: 'status', label: '状态', width: 100, slot: 'status' },
  { prop: 'remark', label: '备注', minWidth: 200, slot: 'remark' },
  { prop: 'createdAt', label: '创建时间', width: 170, slot: 'createdAt' },
  { label: '操作', width: 230, fixed: 'right', slot: 'typeActions' },
];

const typeSearchItems: SearchItem[] = [
  { prop: 'keyword', label: '关键字', placeholder: '名称 / 类型' },
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

const dataColumns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'dictLabel', label: '标签', minWidth: 140 },
  { prop: 'dictValue', label: '数据值', minWidth: 140 },
  { prop: 'dictSort', label: '排序', width: 80 },
  { prop: 'tagType', label: '标签样式', width: 110, slot: 'tagType' },
  { prop: 'status', label: '状态', width: 100, slot: 'status' },
  { prop: 'remark', label: '备注', minWidth: 180, slot: 'remark' },
  { label: '操作', width: 150, fixed: 'right', slot: 'dataActions' },
];

const dataSearchItems: SearchItem[] = [
  { prop: 'label', label: '标签', placeholder: '标签关键字' },
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

function loadTypes(params: Record<string, unknown>) {
  return listDictTypes(params as DictTypeQuery);
}

function loadDataList(params: Record<string, unknown>) {
  if (!selectedType.value) {
    return Promise.resolve({ list: [], total: 0, page: 1, pageSize: 20 });
  }
  return listDictData({
    ...(params as DictDataQuery),
    dictType: selectedType.value.dictType,
  });
}

function selectType(row: DictType | DictTypeOption): void {
  selectedType.value = { id: row.id, dictName: row.dictName, dictType: row.dictType };
  void nextTick(() => dataTableRef.value?.reload());
}

/* ---------------- 字典类型 ---------------- */
const typeDialogVisible = ref(false);
const typeDialogMode = ref<'create' | 'edit'>('create');
const editingTypeId = ref<number | null>(null);
const typeFormRef = ref<FormInstance>();
const typeSaving = ref(false);
const typeForm = reactive({
  dictName: '',
  dictType: '',
  status: 'ENABLED' as AccountStatus,
  remark: '',
});

const typeRules: FormRules = {
  dictName: [{ required: true, message: '请输入字典名称', trigger: 'blur' }],
  dictType: [
    { required: true, message: '请输入字典类型', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]{1,99}$/,
      message: '小写字母开头，仅含小写字母、数字、下划线',
      trigger: 'blur',
    },
  ],
};

function openCreateType(): void {
  typeDialogMode.value = 'create';
  editingTypeId.value = null;
  Object.assign(typeForm, { dictName: '', dictType: '', status: 'ENABLED', remark: '' });
  typeFormRef.value?.clearValidate();
  typeDialogVisible.value = true;
}

function openEditType(row: DictType): void {
  typeDialogMode.value = 'edit';
  editingTypeId.value = row.id;
  Object.assign(typeForm, {
    dictName: row.dictName,
    dictType: row.dictType,
    status: row.status,
    remark: row.remark ?? '',
  });
  typeFormRef.value?.clearValidate();
  typeDialogVisible.value = true;
}

async function handleSaveType(): Promise<void> {
  if (!typeFormRef.value) return;
  const valid = await typeFormRef.value.validate().catch(() => false);
  if (!valid) return;

  typeSaving.value = true;
  try {
    const payload: DictTypePayload = {
      dictName: typeForm.dictName.trim(),
      dictType: typeForm.dictType.trim(),
      status: typeForm.status,
      remark: typeForm.remark || null,
    };
    if (typeDialogMode.value === 'create') {
      await createDictType(payload);
      ElMessage.success('字典类型已创建');
    } else if (editingTypeId.value) {
      await updateDictType(editingTypeId.value, {
        dictName: payload.dictName,
        status: payload.status,
        remark: payload.remark,
      });
      ElMessage.success('字典类型已更新');
    }
    typeDialogVisible.value = false;
    await dictStore.load(true);
    typeTableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    typeSaving.value = false;
  }
}

async function handleDeleteType(row: DictType): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除字典「${row.dictName}」会同时删除其下所有字典数据，且不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
    );
  } catch {
    return;
  }
  try {
    await deleteDictType(row.id);
    ElMessage.success('字典类型已删除');
    if (selectedType.value?.dictType === row.dictType) selectedType.value = null;
    await dictStore.load(true);
    typeTableRef.value?.reload();
    dataTableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

/* ---------------- 字典数据 ---------------- */
const dataDialogVisible = ref(false);
const dataDialogMode = ref<'create' | 'edit'>('create');
const editingDataId = ref<number | null>(null);
const dataFormRef = ref<FormInstance>();
const dataSaving = ref(false);
const dataForm = reactive({
  dictLabel: '',
  dictValue: '',
  dictSort: 0,
  tagType: 'primary' as DictTagType,
  status: 'ENABLED' as AccountStatus,
  remark: '',
});

const dataRules: FormRules = {
  dictLabel: [{ required: true, message: '请输入标签', trigger: 'blur' }],
  dictValue: [{ required: true, message: '请输入数据值', trigger: 'blur' }],
};

const tagTypeOptions: Array<{ label: string; value: DictTagType }> = [
  { label: '默认', value: 'primary' },
  { label: '成功', value: 'success' },
  { label: '信息', value: 'info' },
  { label: '警告', value: 'warning' },
  { label: '危险', value: 'danger' },
];

function openCreateData(): void {
  if (!selectedType.value) {
    ElMessage.warning('请先选择左侧/上方的字典类型');
    return;
  }
  dataDialogMode.value = 'create';
  editingDataId.value = null;
  Object.assign(dataForm, {
    dictLabel: '',
    dictValue: '',
    dictSort: 0,
    tagType: 'primary',
    status: 'ENABLED',
    remark: '',
  });
  dataFormRef.value?.clearValidate();
  dataDialogVisible.value = true;
}

function openEditData(row: DictData): void {
  dataDialogMode.value = 'edit';
  editingDataId.value = row.id;
  Object.assign(dataForm, {
    dictLabel: row.dictLabel,
    dictValue: row.dictValue,
    dictSort: row.dictSort,
    tagType: row.tagType,
    status: row.status,
    remark: row.remark ?? '',
  });
  dataFormRef.value?.clearValidate();
  dataDialogVisible.value = true;
}

async function handleSaveData(): Promise<void> {
  if (!dataFormRef.value) return;
  const valid = await dataFormRef.value.validate().catch(() => false);
  if (!valid) return;
  if (!selectedType.value) return;

  dataSaving.value = true;
  try {
    const payload: DictDataPayload = {
      dictType: selectedType.value.dictType,
      dictLabel: dataForm.dictLabel.trim(),
      dictValue: dataForm.dictValue.trim(),
      dictSort: dataForm.dictSort,
      tagType: dataForm.tagType,
      status: dataForm.status,
      remark: dataForm.remark || null,
    };
    if (dataDialogMode.value === 'create') {
      await createDictData(payload);
      ElMessage.success('字典数据已创建');
    } else if (editingDataId.value) {
      await updateDictData(editingDataId.value, {
        dictLabel: payload.dictLabel,
        dictValue: payload.dictValue,
        dictSort: payload.dictSort,
        tagType: payload.tagType,
        status: payload.status,
        remark: payload.remark,
      });
      ElMessage.success('字典数据已更新');
    }
    dataDialogVisible.value = false;
    await dictStore.load(true);
    dataTableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    dataSaving.value = false;
  }
}

async function handleDeleteData(row: DictData): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除字典数据「${row.dictLabel}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    await deleteDictData(row.id);
    ElMessage.success('字典数据已删除');
    await dictStore.load(true);
    dataTableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

onMounted(async () => {
  const options = await listDictTypeOptions().catch(() => []);
  if (options.length > 0) {
    selectedType.value = options[0];
    await nextTick();
    dataTableRef.value?.reload();
  }
});
</script>

<template>
  <div class="page">
    <ProTable ref="typeTableRef" :columns="typeColumns" :search-items="typeSearchItems" :request="loadTypes" row-key="id">
      <template #toolbar>
        <el-button v-permission="'dict:create'" type="primary" @click="openCreateType">新增字典类型</el-button>
      </template>

      <template #status="{ row }"><DictTag type="sys_normal_disable" :value="row.status" /></template>
      <template #remark="{ row }">{{ row.remark || '-' }}</template>
      <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>

      <template #typeActions="{ row }">
        <el-button link type="primary" @click="selectType(row)">字典数据</el-button>
        <el-button v-permission="'dict:update'" link type="primary" @click="openEditType(row)">编辑</el-button>
        <el-button v-permission="'dict:delete'" link type="danger" @click="handleDeleteType(row)">删除</el-button>
      </template>
    </ProTable>

    <div class="dict-data-head">
      <span class="dict-data-head__title">字典数据</span>
      <el-tag v-if="selectedType" type="primary">{{ selectedType.dictName }}（{{ selectedType.dictType }}）</el-tag>
      <span v-else class="text-muted">请先在类型列表点击「字典数据」</span>
    </div>

    <ProTable
      ref="dataTableRef"
      :columns="dataColumns"
      :search-items="dataSearchItems"
      :request="loadDataList"
      row-key="id"
    >
      <template #toolbar>
        <el-button v-permission="'dict:create'" type="primary" @click="openCreateData">新增字典数据</el-button>
      </template>

      <template #tagType="{ row }">
        <el-tag :type="row.tagType">{{ row.dictLabel }}</el-tag>
      </template>
      <template #status="{ row }"><DictTag type="sys_normal_disable" :value="row.status" /></template>
      <template #remark="{ row }">{{ row.remark || '-' }}</template>

      <template #dataActions="{ row }">
        <el-button v-permission="'dict:update'" link type="primary" @click="openEditData(row)">编辑</el-button>
        <el-button v-permission="'dict:delete'" link type="danger" @click="handleDeleteData(row)">删除</el-button>
      </template>
    </ProTable>

    <AppDialog v-model="typeDialogVisible" :title="typeDialogMode === 'create' ? '新增字典类型' : '编辑字典类型'" width="560px">
      <el-form ref="typeFormRef" :model="typeForm" :rules="typeRules" label-width="90px">
        <el-form-item label="字典名称" prop="dictName">
          <el-input v-model="typeForm.dictName" maxlength="100" />
        </el-form-item>
        <el-form-item label="字典类型" prop="dictType">
          <el-input v-model="typeForm.dictType" :disabled="typeDialogMode === 'edit'" maxlength="100" placeholder="如 sys_normal_disable" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="typeForm.status">
            <el-radio value="ENABLED">启用</el-radio>
            <el-radio value="DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="typeForm.remark" type="textarea" :rows="3" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="typeSaving" @click="handleSaveType">保存</el-button>
      </template>
    </AppDialog>

    <AppDialog v-model="dataDialogVisible" :title="dataDialogMode === 'create' ? '新增字典数据' : '编辑字典数据'" width="560px">
      <el-form ref="dataFormRef" :model="dataForm" :rules="dataRules" label-width="90px">
        <el-form-item label="标签" prop="dictLabel">
          <el-input v-model="dataForm.dictLabel" maxlength="100" />
        </el-form-item>
        <el-form-item label="数据值" prop="dictValue">
          <el-input v-model="dataForm.dictValue" maxlength="100" />
        </el-form-item>
        <el-form-item label="标签样式">
          <el-select v-model="dataForm.tagType" style="width: 100%">
            <el-option v-for="item in tagTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="dataForm.dictSort" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="dataForm.status">
            <el-radio value="ENABLED">启用</el-radio>
            <el-radio value="DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="dataForm.remark" type="textarea" :rows="3" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dataDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dataSaving" @click="handleSaveData">保存</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.dict-data-head {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 0 4px;
}

.dict-data-head__title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2d3d;
}
</style>
