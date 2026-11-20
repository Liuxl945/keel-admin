<script setup lang="ts">
defineOptions({ name: 'SystemUser' });

import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import ProTable from '@/components/ProTable/index.vue';
import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';
import AppDialog from '@/components/AppDialog/index.vue';
import DictTag from '@/components/DictTag/index.vue';
import {
  assignUserRoles,
  createUser,
  deleteUser,
  downloadUserImportTemplate,
  exportUsers,
  importUsers,
  listUsers,
  resetUserPassword,
  updateUser,
  type UserQuery,
} from '@/api/user';
import { listRoleOptions } from '@/api/role';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/datetime';
import type { AccountStatus, AdminUser, RoleOption } from '@/types/entities';

const userStore = useUserStore();
const tableRef = ref<any>(null);
const roleOptions = ref<RoleOption[]>([]);

const columns: ProTableColumn[] = [
  { type: 'index', label: '序号', width: 70 },
  { prop: 'username', label: '账号', width: 110 },
  { prop: 'nickname', label: '昵称', width: 110 },
  { prop: 'roles', label: '角色', minWidth: 130, slot: 'roles' },
  { prop: 'status', label: '状态', width: 90, slot: 'status' },
  { prop: 'phone', label: '手机号', width: 115, slot: 'phone' },
  { prop: 'lastLoginAt', label: '最后登录', width: 150, slot: 'lastLoginAt' },
  { prop: 'createdAt', label: '创建时间', width: 150, slot: 'createdAt' },
  { label: '操作', width: 220, fixed: 'right', slot: 'actions' },
];

const searchItems: SearchItem[] = [
  { prop: 'keyword', label: '关键字', placeholder: '账号 / 昵称' },
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
  return listUsers(params as UserQuery);
}

const formVisible = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editingId = ref<number | null>(null);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({
  username: '',
  password: '',
  nickname: '',
  email: '',
  phone: '',
  status: 'ENABLED' as AccountStatus,
  roleIds: [] as number[],
});

const rules: FormRules = {
  username: [
    {
      validator: (_rule, value: string, callback) => {
        if (formMode.value === 'create' && !String(value || '').trim()) {
          callback(new Error('请输入账号'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  password: [
    {
      validator: (_rule, value: string, callback) => {
        if (formMode.value === 'create' && !value) {
          callback(new Error('请输入初始密码'));
          return;
        }
        if (value && value.length < 8) {
          callback(new Error('密码至少 8 位'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
};

function resetForm(): void {
  form.username = '';
  form.password = '';
  form.nickname = '';
  form.email = '';
  form.phone = '';
  form.status = 'ENABLED';
  form.roleIds = [];
  formRef.value?.clearValidate();
}

function openCreate(): void {
  formMode.value = 'create';
  editingId.value = null;
  resetForm();
  formVisible.value = true;
}

function openEdit(row: AdminUser): void {
  formMode.value = 'edit';
  editingId.value = row.id;
  resetForm();
  form.username = row.username;
  form.nickname = row.nickname;
  form.email = row.email || '';
  form.phone = row.phone || '';
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
      await createUser({
        username: form.username.trim(),
        password: form.password,
        nickname: form.nickname.trim(),
        email: form.email || null,
        phone: form.phone || null,
        status: form.status,
        roleIds: form.roleIds,
      });
      ElMessage.success('用户已创建');
    } else if (editingId.value) {
      await updateUser(editingId.value, {
        nickname: form.nickname.trim(),
        email: form.email || null,
        phone: form.phone || null,
        status: form.status,
      });
      ElMessage.success('用户已更新');
    }
    formVisible.value = false;
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row: AdminUser): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除账号「${row.username}」吗？删除后该账号无法登录。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    await deleteUser(row.id);
    ElMessage.success('用户已删除');
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

const rolesVisible = ref(false);
const roleTarget = ref<AdminUser | null>(null);
const selectedRoleIds = ref<number[]>([]);

function openRoles(row: AdminUser): void {
  roleTarget.value = row;
  selectedRoleIds.value = row.roles.map((role) => role.id);
  rolesVisible.value = true;
}

async function handleAssignRoles(): Promise<void> {
  if (!roleTarget.value) return;
  try {
    await assignUserRoles(roleTarget.value.id, selectedRoleIds.value);
    ElMessage.success('角色已更新');
    rolesVisible.value = false;
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

const passwordVisible = ref(false);
const passwordTarget = ref<AdminUser | null>(null);
const newPassword = ref('');
const passwordSaving = ref(false);

function openResetPassword(row: AdminUser): void {
  passwordTarget.value = row;
  newPassword.value = '';
  passwordVisible.value = true;
}

async function handleResetPassword(): Promise<void> {
  if (!passwordTarget.value) return;
  if (newPassword.value.length < 8) {
    ElMessage.warning('密码至少 8 位');
    return;
  }
  passwordSaving.value = true;
  try {
    await resetUserPassword(passwordTarget.value.id, newPassword.value);
    ElMessage.success('密码已重置');
    passwordVisible.value = false;
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    passwordSaving.value = false;
  }
}

const exporting = ref(false);
const importing = ref(false);
const importInputRef = ref<HTMLInputElement>();

async function handleExport(): Promise<void> {
  exporting.value = true;
  try {
    await exportUsers(tableRef.value?.getSearchParams() ?? {});
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    exporting.value = false;
  }
}

async function handleDownloadTemplate(): Promise<void> {
  try {
    await downloadUserImportTemplate();
  } catch {
    // 错误提示由 request 拦截器统一处理
  }
}

function triggerImport(): void {
  importInputRef.value?.click();
}

async function handleImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  importing.value = true;
  try {
    const result = await importUsers(file);
    ElMessage.success(`导入完成：成功 ${result.success} 条，跳过 ${result.skipped} 条`);
    if (result.errors.length > 0) {
      await ElMessageBox.alert(
        result.errors.slice(0, 10).join('；'),
        '部分数据未导入',
        { type: 'warning' },
      ).catch(() => undefined);
    }
    tableRef.value?.reload();
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    importing.value = false;
  }
}

onMounted(async () => {
  if (!userStore.hasPermission('role:list')) return;
  roleOptions.value = await listRoleOptions().catch(() => []);
});
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
        <el-button v-permission="'user:create'" type="primary" @click="openCreate">新增用户</el-button>
        <el-button v-permission="'user:export'" :loading="exporting" @click="handleExport">导出</el-button>
        <el-button v-permission="'user:import'" @click="handleDownloadTemplate">导入模板</el-button>
        <el-button v-permission="'user:import'" :loading="importing" @click="triggerImport">导入</el-button>
        <input
          ref="importInputRef"
          type="file"
          accept=".xlsx,.xls"
          class="hidden-file-input"
          @change="handleImportFile"
        />
      </template>

      <template #roles="{ row }">
        <el-tag v-for="role in row.roles" :key="role.id" size="small" class="mr-4">{{ role.name }}</el-tag>
        <span v-if="row.roles.length === 0" class="text-muted">未分配</span>
      </template>

      <template #status="{ row }"><DictTag type="sys_normal_disable" :value="row.status" /></template>

      <template #phone="{ row }">{{ row.phone || '-' }}</template>
      <template #lastLoginAt="{ row }">{{ formatDateTime(row.lastLoginAt) }}</template>
      <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>

      <template #actions="{ row }">
        <el-button v-permission="'user:update'" link type="primary" @click="openEdit(row)">编辑</el-button>
        <el-button v-permission="'user:assign'" link type="primary" @click="openRoles(row)">角色</el-button>
        <el-button v-permission="'user:reset'" link type="warning" @click="openResetPassword(row)">
          重置密码
        </el-button>
        <el-button
          v-if="!row.isSuperAdmin"
          v-permission="'user:delete'"
          link
          type="danger"
          @click="handleDelete(row)"
        >
          删除
        </el-button>
      </template>
    </ProTable>

    <AppDialog v-model="formVisible" :title="formMode === 'create' ? '新增用户' : '编辑用户'" width="600px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" :disabled="formMode === 'edit'" maxlength="30" />
        </el-form-item>
        <el-form-item v-if="formMode === 'create'" label="初始密码" prop="password">
          <el-input v-model="form.password" type="password" show-password maxlength="100" />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" maxlength="50" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" maxlength="100" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" maxlength="20" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="ENABLED">启用</el-radio>
            <el-radio value="DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="formMode === 'create'" label="角色">
          <el-select v-model="form.roleIds" multiple filterable placeholder="请选择角色" style="width: 100%">
            <el-option
              v-for="role in roleOptions"
              :key="role.id"
              :label="`${role.name}（${role.code}）`"
              :value="role.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </AppDialog>

    <AppDialog v-model="rolesVisible" title="分配角色" width="480px">
      <p class="dialog-tip">账号：{{ roleTarget?.username }}</p>
      <el-select v-model="selectedRoleIds" multiple filterable placeholder="请选择角色" style="width: 100%">
        <el-option
          v-for="role in roleOptions"
          :key="role.id"
          :label="`${role.name}（${role.code}）`"
          :value="role.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="rolesVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAssignRoles">保存</el-button>
      </template>
    </AppDialog>

    <AppDialog v-model="passwordVisible" title="重置密码" width="420px">
      <p class="dialog-tip">账号：{{ passwordTarget?.username }}</p>
      <el-input v-model="newPassword" type="password" show-password placeholder="新密码，至少 8 位" />
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="handleResetPassword">确认重置</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.dialog-tip {
  margin: 0 0 12px;
  color: #606266;
}

.hidden-file-input {
  display: none;
}
</style>
