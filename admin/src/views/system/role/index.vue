<script setup lang="ts">
defineOptions({ name: 'SystemRole' });

import { nextTick, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import {
  assignRoleMenus,
  createRole,
  deleteRole,
  getRole,
  listRoles,
  updateRole,
  type RoleQuery,
} from '@/api/role';
import { listMenus } from '@/api/menu';
import { formatDateTime } from '@/utils/datetime';
import type { AccountStatus, MenuNode, Role } from '@/types/entities';

const tableRef = ref<any>(null);
const menuTree = ref<MenuNode[]>([]);

const columns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'name', label: '角色名称', width: 130 },
  { prop: 'code', label: '编码', width: 130 },
  { prop: 'description', label: '描述', minWidth: 140, slot: 'description' },
  { prop: 'userCount', label: '用户数', width: 80 },
  { prop: 'menuCount', label: '菜单数', width: 80 },
  { prop: 'sort', label: '排序', width: 70 },
  { prop: 'status', label: '状态', width: 90, slot: 'status' },
  { prop: 'createdAt', label: '创建时间', width: 160, slot: 'createdAt' },
  { label: '操作', width: 200, fixed: 'right', slot: 'actions' },
];

const searchItems: SearchItem[] = [
  { prop: 'keyword', label: '关键字', placeholder: '角色名称 / 编码' },
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
  return listRoles(params as RoleQuery);
}

const formVisible = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editingId = ref<number | null>(null);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({
  name: '',
  code: '',
  description: '',
  sort: 0,
  status: 'ENABLED' as AccountStatus,
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  code: [
    {
      validator: (_rule, value: string, callback) => {
        if (formMode.value === 'create' && !value) {
          callback(new Error('请输入角色编码'));
          return;
        }
        if (value && !/^[a-z][a-z0-9_]{1,49}$/.test(value)) {
          callback(new Error('小写字母开头，仅含小写字母、数字、下划线'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

function resetForm(): void {
  form.name = '';
  form.code = '';
  form.description = '';
  form.sort = 0;
  form.status = 'ENABLED';
  formRef.value?.clearValidate();
}

function openCreate(): void {
  formMode.value = 'create';
  editingId.value = null;
  resetForm();
  formVisible.value = true;
}

function openEdit(row: Role): void {
  formMode.value = 'edit';
  editingId.value = row.id;
  resetForm();
  form.name = row.name;
  form.code = row.code;
  form.description = row.description || '';
  form.sort = row.sort;
  form.status = row.status;
  formVisible.value = true;
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    if (formMode.value === 'create') {
      await createRole({
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description || null,
        sort: form.sort,
        status: form.status,
      });
      ElMessage.success('角色已创建');
    } else if (editingId.value) {
      await updateRole(editingId.value, {
        name: form.name.trim(),
        description: form.description || null,
        sort: form.sort,
        status: form.status,
      });
      ElMessage.success('角色已更新');
    }
    formVisible.value = false;
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row: Role): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除角色「${row.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    await deleteRole(row.id);
    ElMessage.success('角色已删除');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

const menusVisible = ref(false);
const menuTarget = ref<Role | null>(null);
const menuTreeRef = ref<any>(null);
const menuSaving = ref(false);

function collectWithAncestors(ids: number[], tree: MenuNode[]): number[] {
  const parentMap = new Map<number, number | null>();
  const walk = (nodes: MenuNode[], parentId: number | null): void => {
    for (const node of nodes) {
      parentMap.set(node.id, parentId);
      walk(node.children, node.id);
    }
  };
  walk(tree, null);

  const result = new Set(ids);
  for (const id of ids) {
    let current = parentMap.get(id) ?? null;
    while (current) {
      result.add(current);
      current = parentMap.get(current) ?? null;
    }
  }
  return [...result];
}

async function openMenus(row: Role): Promise<void> {
  try {
    menuTree.value = await listMenus();
    const detail = await getRole(row.id);
    menuTarget.value = row;
    menusVisible.value = true;
    await nextTick();
    // check-strictly 下父子互不联动，保存时再补祖先节点
    menuTreeRef.value?.setCheckedKeys(detail.menuIds);
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

async function handleAssignMenus(): Promise<void> {
  if (!menuTarget.value) return;
  const checked = (menuTreeRef.value?.getCheckedKeys(false) ?? []) as number[];
  const ids = collectWithAncestors(checked, menuTree.value);
  menuSaving.value = true;
  try {
    await assignRoleMenus(menuTarget.value.id, ids);
    ElMessage.success('菜单权限已保存');
    menusVisible.value = false;
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    menuSaving.value = false;
  }
}

const defaultMenuProps = { label: 'name', children: 'children' };
</script>

<template>
  <div class="page">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :search-items="searchItems"
      :request="loadData"
      row-key="id"
    >
      <template #toolbar>
        <el-button v-permission="'role:create'" type="primary" @click="openCreate">新增角色</el-button>
      </template>

      <template #description="{ row }">{{ row.description || '-' }}</template>
      <template #status="{ row }"><DictTag type="sys_normal_disable" :value="row.status" /></template>
      <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>

      <template #actions="{ row }">
        <el-button v-permission="'role:update'" link type="primary" @click="openEdit(row)">编辑</el-button>
        <el-button v-permission="'role:assign'" link type="primary" @click="openMenus(row)">菜单权限</el-button>
        <el-button
          v-if="row.code !== 'system_admin'"
          v-permission="'role:delete'"
          link
          type="danger"
          @click="handleDelete(row)"
        >
          删除
        </el-button>
      </template>
    </ProTable>

    <AppDialog v-model="formVisible" :title="formMode === 'create' ? '新增角色' : '编辑角色'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="form.code" :disabled="formMode === 'edit'" maxlength="50" placeholder="如 system_admin" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" maxlength="255" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="ENABLED">启用</el-radio>
            <el-radio value="DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </AppDialog>

    <AppDialog v-model="menusVisible" title="分配菜单权限" width="520px">
      <p class="dialog-tip">角色：{{ menuTarget?.name }}</p>
      <el-tree
        ref="menuTreeRef"
        :data="menuTree"
        :props="defaultMenuProps"
        node-key="id"
        show-checkbox
        check-strictly
        default-expand-all
      />
      <template #footer>
        <el-button @click="menusVisible = false">取消</el-button>
        <el-button type="primary" :loading="menuSaving" @click="handleAssignMenus">保存</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.dialog-tip {
  margin: 0 0 12px;
  color: #606266;
}
</style>
